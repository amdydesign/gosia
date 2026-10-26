<?php
/**
 * Face ID: save the passkey made on this device (logged in).
 *
 * POST /api/auth/passkey/register.php
 *   { state, id, client_data, authenticator_data, public_key, algorithm, name }  (binary as base64url)
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../config/Passkeys.php';
require_once __DIR__ . '/../../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = (int) getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'passkeys');

    $challenge = Passkeys::useChallenge($conn, $input['state'] ?? '', 'register', $userId);
    $clientData = Passkeys::fromB64url($input['client_data'] ?? '');
    $authData = Passkeys::fromB64url($input['authenticator_data'] ?? '');
    Passkeys::checkClientData($clientData, 'webauthn.create', $challenge);
    $count = Passkeys::checkAuthData($authData);

    if (!in_array((int) ($input['algorithm'] ?? 0), Passkeys::ALGORITHMS, true)) {
        throw new RuntimeException('Nieobsługiwany klucz.');
    }
    $pem = Passkeys::pemFromSpki(Passkeys::fromB64url($input['public_key'] ?? ''));
    $credentialId = (string) ($input['id'] ?? '');
    if ($credentialId === '' || strlen($credentialId) > 255 || Passkeys::fromB64url($credentialId) === '') {
        throw new RuntimeException('Nieprawidłowa odpowiedź urządzenia.');
    }
    $name = mb_substr(trim((string) ($input['name'] ?? '')), 0, 100) ?: 'To urządzenie';

    $conn->prepare("
        INSERT INTO passkeys (user_id, credential_id, public_key, sign_count, name)
        VALUES (:user_id, :credential_id, :public_key, :sign_count, :name)
        ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), sign_count = VALUES(sign_count), name = VALUES(name)
    ")->execute([
        'user_id' => $userId,
        'credential_id' => $credentialId,
        'public_key' => $pem,
        'sign_count' => $count,
        'name' => $name,
    ]);

    Response::success(['message' => 'Face ID włączone']);
} catch (RuntimeException $e) {
    Response::error($e->getMessage(), 400);
} catch (Exception $e) {
    Response::error('Nie udało się zapisać Face ID', 500);
}
