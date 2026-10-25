<?php
/**
 * Change an account - admin only.
 *
 * PUT /api/users/update.php?id=5  { display_name?, password?, is_active? }
 *
 * A new password or blocking logs the account out on every device (token_version + 1).
 * The admin account cannot be blocked, so the panel always has someone who can let people in.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    Response::error('Method not allowed', 405);
}

try {
    $db = new Database();
    $conn = $db->getConnection();
    requireAdminId($conn);

    $id = (int) ($_GET['id'] ?? 0);
    $user = $id ? Users::find($conn, $id) : null;
    if (!$user) {
        Response::notFound('Nie ma takiego konta');
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $fields = [];
    $params = ['id' => $id];
    $logout = false;

    if (array_key_exists('display_name', $input)) {
        $name = trim((string) $input['display_name']);
        if ($name === '' || mb_strlen($name) > 100) {
            Response::validationError(['display_name' => 'Wpisz imię (do 100 znaków).']);
        }
        $fields[] = 'display_name = :name';
        $params['name'] = $name;
    }

    if (array_key_exists('password', $input)) {
        $password = (string) $input['password'];
        if ($error = Users::passwordError($password)) {
            Response::validationError(['password' => $error]);
        }
        $fields[] = 'password_hash = :hash';
        $params['hash'] = password_hash($password, PASSWORD_DEFAULT);
        $logout = true;
    }

    if (array_key_exists('is_active', $input)) {
        $active = $input['is_active'] ? 1 : 0;
        if (!$active && (int) $user['is_admin'] === 1) {
            Response::error('Konta administratora nie można zablokować', 400);
        }
        $fields[] = 'is_active = :active';
        $params['active'] = $active;
        $logout = $logout || !$active;
    }

    if (!$fields) {
        Response::error('Nic do zmiany', 400);
    }
    if ($logout) {
        $fields[] = 'token_version = COALESCE(token_version, 1) + 1';
    }

    $conn->prepare("UPDATE users SET " . implode(', ', $fields) . " WHERE id = :id")->execute($params);
    if (isset($params['active']) && !$params['active']) {
        // a blocked account gets no more reminders on its phone
        Schema::ensure($conn, 'push_subscriptions');
        $conn->prepare("DELETE FROM push_subscriptions WHERE user_id = :id")->execute(['id' => $id]);
    }

    $user = Users::find($conn, $id);
    Response::success([
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'display_name' => trim((string) ($user['display_name'] ?? '')) ?: $user['username'],
        'is_admin' => (int) $user['is_admin'] === 1,
        'is_active' => (int) $user['is_active'] === 1,
        'last_login' => $user['last_login'],
        'created_at' => $user['created_at'],
    ]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('User update failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać konta', 500);
}
