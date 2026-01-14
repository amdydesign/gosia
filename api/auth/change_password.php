<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

// Authenticate user
$user = requireAuth();

// Only POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$currentPassword = $input['current_password'] ?? '';
$newPassword = $input['new_password'] ?? '';

if (empty($currentPassword) || empty($newPassword)) {
    Response::validationError(['message' => 'Wymagane jest podanie obecnego i nowego hasła.']);
}

// Validation logic (min length, etc)
if (strlen($newPassword) < 6) {
    Response::validationError(['new_password' => 'Nowe hasło musi mieć co najmniej 6 znaków.']);
}

try {
    $db = new Database();
    $conn = $db->getConnection();

    // 1. Get current hash
    $stmt = $conn->prepare("SELECT password_hash FROM users WHERE id = :id");
    $stmt->execute(['id' => $user['id']]);
    $currentUser = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$currentUser) {
        Response::error('Użytkownik nie istnieje.', 404);
    }

    // 2. Verify current password
    if (!password_verify($currentPassword, $currentUser['password_hash'])) {
        Response::error('Obecne hasło jest nieprawidłowe.', 401);
    }

    // 3. Hash new password
    $newHash = password_hash($newPassword, PASSWORD_DEFAULT);

    // 4. Update DB
    $update = $conn->prepare("UPDATE users SET password_hash = :hash WHERE id = :id");
    $update->execute([
        'hash' => $newHash,
        'id' => $user['id']
    ]);

    Response::success(null, 'Hasło zostało pomyślnie zmienione.');

} catch (Exception $e) {
    Response::error('Wystąpił błąd serwera: ' . $e->getMessage(), 500);
}
