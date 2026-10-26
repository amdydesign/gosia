<?php
/**
 * Face ID: log in with a passkey.
 *
 * POST /api/auth/passkey/login.php
 *   { state, id, client_data, authenticator_data, signature, user_handle }  (binary as base64url)
 * -> { user } + the session cookie ("zapamiętaj mnie")
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../config/Users.php';
require_once __DIR__ . '/../../config/Session.php';
require_once __DIR__ . '/../../config/Passkeys.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $db = new Database();
    $conn = $db->getConnection();
    Users::ensure($conn);
    Schema::ensure($conn, 'passkeys');

    $ip = RateLimit::ip();
    if (RateLimit::wait($conn, 'passkey_login', $ip, 20, 15) > 0) {
        Response::error('Za dużo prób. Spróbuj za kilka minut.', 429);
    }

    $challenge = Passkeys::useChallenge($conn, $input['state'] ?? '', 'login');
    $stmt = $conn->prepare("SELECT id, user_id, public_key, sign_count FROM passkeys WHERE credential_id = :id");
    $stmt->execute(['id' => (string) ($input['id'] ?? '')]);
    $key = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$key) {
        RateLimit::hit($conn, 'passkey_login', $ip);
        throw new RuntimeException('Face ID nie jest włączone dla tego konta. Zaloguj się hasłem i włącz je w Ustawieniach.');
    }
    $handle = (string) ($input['user_handle'] ?? '');
    if ($handle !== '' && Passkeys::userIdFromHandle($handle) !== (int) $key['user_id']) {
        throw new RuntimeException('Nieprawidłowa odpowiedź urządzenia.');
    }

    $clientData = Passkeys::fromB64url($input['client_data'] ?? '');
    $authData = Passkeys::fromB64url($input['authenticator_data'] ?? '');
    Passkeys::checkClientData($clientData, 'webauthn.get', $challenge);
    $count = Passkeys::checkAuthData($authData);
    if (!Passkeys::verifySignature($key['public_key'], $authData, $clientData, Passkeys::fromB64url($input['signature'] ?? ''))) {
        RateLimit::hit($conn, 'passkey_login', $ip);
        throw new RuntimeException('Nie udało się potwierdzić Face ID.');
    }
    // A counter that goes backwards means a copied key (synced passkeys always send 0)
    if ($count > 0 && $count <= (int) $key['sign_count']) {
        throw new RuntimeException('Nie udało się potwierdzić Face ID.');
    }

    $stmt = $conn->prepare("SELECT id, username, email, display_name, is_admin, is_active, token_version FROM users WHERE id = :id");
    $stmt->execute(['id' => $key['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user || (int) $user['is_active'] !== 1) {
        Response::error('To konto jest zablokowane. Napisz do administratora.', 403);
    }

    $conn->prepare("UPDATE passkeys SET sign_count = :count, last_used_at = NOW() WHERE id = :id")->execute(['count' => $count, 'id' => $key['id']]);
    $conn->prepare("UPDATE users SET last_login = NOW() WHERE id = :id")->execute(['id' => $user['id']]);
    Session::start($user['id'], $user['username'], $user['token_version'] ?? 1, true);

    Response::success(['user' => Users::publicData($user)]);
} catch (RuntimeException $e) {
    Response::error($e->getMessage(), 400);
} catch (Exception $e) {
    Response::error('Nie udało się zalogować Face ID', 500);
}
