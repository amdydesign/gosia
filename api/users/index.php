<?php
/**
 * Accounts - admin only.
 *
 * GET  /api/users/index.php  -> [{ id, username, display_name, is_admin, is_active, last_login, created_at }]
 * POST /api/users/index.php  { display_name, username, password } -> the new account
 *
 * A new account starts empty: no data of other accounts, no AI key (it adds its own).
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

try {
    $db = new Database();
    $conn = $db->getConnection();
    requireAdminId($conn);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $rows = $conn->query("
            SELECT id, username, display_name, is_admin, is_active, last_login, created_at
            FROM users ORDER BY is_admin DESC, id ASC
        ")->fetchAll(PDO::FETCH_ASSOC);
        Response::success(array_map('accountRow', $rows));
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        Response::error('Method not allowed', 405);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $name = trim((string) ($input['display_name'] ?? ''));
    $username = trim((string) ($input['username'] ?? ''));
    $password = (string) ($input['password'] ?? '');

    $errors = array_filter([
        'display_name' => $name === '' ? 'Wpisz imię.' : (mb_strlen($name) > 100 ? 'Imię jest za długie.' : null),
        'username' => Users::usernameError($username),
        'password' => Users::passwordError($password),
    ]);
    if ($errors) {
        Response::validationError($errors);
    }

    $stmt = $conn->prepare("SELECT 1 FROM users WHERE username = :username");
    $stmt->execute(['username' => $username]);
    if ($stmt->fetchColumn()) {
        Response::validationError(['username' => 'Ten login jest już zajęty.']);
    }

    $conn->prepare("
        INSERT INTO users (username, password_hash, display_name, is_admin, is_active)
        VALUES (:username, :hash, :name, 0, 1)
    ")->execute([
        'username' => $username,
        'hash' => password_hash($password, PASSWORD_DEFAULT),
        'name' => $name,
    ]);
    $user = Users::find($conn, $conn->lastInsertId());
    Response::success(accountRow($user), 'Konto założone', 201);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Users failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać konta', 500);
}

function accountRow(array $u)
{
    return [
        'id' => (int) $u['id'],
        'username' => $u['username'],
        'display_name' => trim((string) ($u['display_name'] ?? '')) ?: $u['username'],
        'is_admin' => (int) $u['is_admin'] === 1,
        'is_active' => (int) $u['is_active'] === 1,
        'last_login' => $u['last_login'],
        'created_at' => $u['created_at'],
    ];
}
