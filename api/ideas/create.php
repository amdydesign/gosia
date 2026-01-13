<?php
/**
 * Create Idea
 * POST /api/ideas/create.php
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $data = json_decode(file_get_contents("php://input"));

    if (!isset($data->title) || empty($data->title)) {
        Response::error('Title is required', 400);
    }

    $db = new Database();
    $conn = $db->getConnection();

    $query = "
        INSERT INTO ideas (user_id, title, content, status)
        VALUES (:user_id, :title, :content, :status)
    ";

    $stmt = $conn->prepare($query);
    $stmt->execute([
        'user_id' => $userId,
        'title' => $data->title,
        'content' => isset($data->content) ? $data->content : '',
        'status' => 'draft'
    ]);

    $id = $conn->lastInsertId();

    Response::success(['id' => $id, 'message' => 'Idea created successfully'], 201);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Creation failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to create idea', 500);
}
