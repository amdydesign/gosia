<?php
/**
 * Own profile - the name the app greets you with.
 *
 * PUT /api/auth/profile.php  { display_name } -> user
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
    $name = trim((string) ($input['display_name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 100) {
        Response::validationError(['display_name' => 'Wpisz imię (do 100 znaków).']);
    }

    $db = new Database();
    $conn = $db->getConnection();
    $conn->prepare("UPDATE users SET display_name = :name WHERE id = :id")->execute(['name' => $name, 'id' => $userId]);

    Response::success(['user' => Users::publicData(Users::find($conn, $userId))]);

} catch (Exception $e) {
    Response::error('Nie udało się zapisać imienia', 500);
}
