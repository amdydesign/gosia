<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../config/RateLimit.php';

// wrong current password: 5 tries, then 15 minutes pause (someone at an unlocked phone guessing)
const CHANGE_PASSWORD_MAX_TRIES = 5;
const CHANGE_PASSWORD_PAUSE_MINUTES = 15;

// Authenticate user
$user = requireAuth();

// Only POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$currentPassword = $input['current_password'] ?? '';
$newPassword = $input['new_password'] ?? '';

if (empty($currentPassword) || empty($newPassword)) {
    Response::validationError(['message' => 'Wymagane jest podanie obecnego i nowego hasła.']);
}

// Validation logic (min length, etc)
if ($error = Users::passwordError($newPassword)) {
    Response::validationError(['new_password' => $error]);
}

try {
    $db = new Database();
    $conn = $db->getConnection();

    $limitKey = 'user:' . $user['sub'];
    $wait = RateLimit::wait($conn, 'change_password', $limitKey, CHANGE_PASSWORD_MAX_TRIES, CHANGE_PASSWORD_PAUSE_MINUTES);
    if ($wait > 0) {
        Response::error('Za dużo prób. Spróbuj za ' . $wait . ' min.', 429);
    }

    // 1. Get current hash
    $stmt = $conn->prepare("SELECT password_hash FROM users WHERE id = :id");
    $stmt->execute(['id' => $user['sub']]);
    $currentUser = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$currentUser) {
        Response::error('Użytkownik nie istnieje.', 404);
    }

    // 2. Verify current password
    if (!password_verify($currentPassword, $currentUser['password_hash'])) {
        RateLimit::hit($conn, 'change_password', $limitKey);
        // not 401 - that would log the app out
        Response::error('Obecne hasło jest nieprawidłowe.', 400);
    }

    RateLimit::clear($conn, 'change_password', $limitKey);

    // 3. Hash new password
    $newHash = password_hash($newPassword, PASSWORD_DEFAULT);

    // 4. Update DB (password_hash and increment token_version)
    $update = $conn->prepare("UPDATE users SET password_hash = :hash, token_version = token_version + 1 WHERE id = :id");
    $update->execute([
        'hash' => $newHash,
        'id' => $user['sub']
    ]);

    // Other devices are logged out (token_version); this one gets a fresh cookie and stays in
    $version = $conn->prepare("SELECT username, token_version FROM users WHERE id = :id");
    $version->execute(['id' => $user['sub']]);
    $fresh = $version->fetch(PDO::FETCH_ASSOC);
    Session::start($user['sub'], $fresh['username'], $fresh['token_version'], !empty($user['rem']) || JWTHandler::$source === 'header');

    Response::success(null, 'Hasło zostało pomyślnie zmienione.');

} catch (Exception $e) {
    error_log('change_password: ' . $e->getMessage());
    Response::error('Nie udało się zmienić hasła. Spróbuj jeszcze raz.', 500);
}
