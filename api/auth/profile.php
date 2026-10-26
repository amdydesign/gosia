<?php
/**
 * Own profile - the name the app greets you with.
 *
 * PUT /api/auth/profile.php  { display_name?, email? } -> user
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $fields = [];
    $params = ['id' => $userId];

    if (array_key_exists('display_name', $input)) {
        $name = trim((string) $input['display_name']);
        if ($name === '' || mb_strlen($name) > 100) {
            Response::validationError(['display_name' => 'Wpisz imię (do 100 znaków).']);
        }
        $fields[] = 'display_name = :name';
        $params['name'] = $name;
    }
    // e-mail for "Nie pamiętasz hasła?" (empty clears it)
    if (array_key_exists('email', $input)) {
        $email = trim((string) $input['email']);
        if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 100)) {
            Response::validationError(['email' => 'To nie wygląda na adres e-mail.']);
        }
        $fields[] = 'email = :email';
        $params['email'] = $email === '' ? null : $email;
    }
    if (!$fields) {
        Response::validationError(['display_name' => 'Nic do zapisania.']);
    }

    $db = new Database();
    $conn = $db->getConnection();
    $conn->prepare("UPDATE users SET " . implode(', ', $fields) . " WHERE id = :id")->execute($params);

    Response::success(['user' => Users::publicData(Users::find($conn, $userId))]);
} catch (Exception $e) {
    Response::error('Nie udało się zapisać', 500);
}
