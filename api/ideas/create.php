<?php
/**
 * Create Idea
 * POST /api/ideas/create.php
 */

require_once __DIR__ . '/../bootstrap.php';
requireMethod('POST');

try {
    $userId = getCurrentUserId();
    $data = json_decode(file_get_contents("php://input"));

    if (!isset($data->title) || empty($data->title)) {
        Response::error('Title is required', 400);
    }

    $conn = db();

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
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Creation failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to create idea', 500);
}
