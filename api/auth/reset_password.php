<?php
/**
 * Set a new password from the e-mailed link - and log in right away.
 *
 * POST /api/auth/reset_password.php { token, password } -> { user } + session cookie
 * Every other device is logged out (token_version).
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Users.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Session.php';
require_once __DIR__ . '/../config/RateLimit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$token = trim((string) ($input['token'] ?? ''));
$password = (string) ($input['password'] ?? '');

if ($error = Users::passwordError($password)) {
    Response::validationError(['password' => $error]);
}

try {
    $db = new Database();
    $conn = $db->getConnection();
    Users::ensure($conn);
    Schema::ensure($conn, 'password_resets');

    $ip = RateLimit::ip();
    if (RateLimit::wait($conn, 'reset_use', $ip, 10, 60) > 0) {
        Response::error('Za dużo prób. Spróbuj za godzinę.', 429);
    }

    $stmt = $conn->prepare("
        SELECT r.id, r.user_id, u.username FROM password_resets r
        JOIN users u ON u.id = r.user_id AND u.is_active = 1
        WHERE r.token_hash = :hash AND r.used_at IS NULL AND r.expires_at > NOW()
    ");
    $stmt->execute(['hash' => hash('sha256', $token)]);
    $reset = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$reset) {
        RateLimit::hit($conn, 'reset_use', $ip);
        Response::error('Ten link już nie działa. Poproś o nowy na ekranie logowania.', 400);
    }

    $conn->prepare("UPDATE users SET password_hash = :hash, token_version = COALESCE(token_version, 1) + 1 WHERE id = :id")
        ->execute(['hash' => password_hash($password, PASSWORD_DEFAULT), 'id' => $reset['user_id']]);
    $conn->prepare("UPDATE password_resets SET used_at = NOW() WHERE id = :id")->execute(['id' => $reset['id']]);

    $user = Users::find($conn, $reset['user_id']);
    $version = $conn->prepare("SELECT token_version FROM users WHERE id = :id");
    $version->execute(['id' => $reset['user_id']]);
    Session::start($reset['user_id'], $reset['username'], (int) $version->fetchColumn(), true);

    Response::success(['user' => Users::publicData($user)], 'Hasło zmienione');

} catch (Exception $e) {
    Response::error('Wystąpił błąd serwera.', 500);
}
