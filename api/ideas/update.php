<?php
/**
 * Update Idea
 * PUT /api/ideas/update.php?id=1
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
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    $data = json_decode(file_get_contents("php://input"));

    if (!$id) {
        Response::error('ID is required', 400);
    }

    $db = new Database();
    $conn = $db->getConnection();

    // Verify ownership
    $checkQuery = "SELECT id FROM ideas WHERE id = :id AND user_id = :user_id";
    $checkStmt = $conn->prepare($checkQuery);
    $checkStmt->execute(['id' => $id, 'user_id' => $userId]);

    if ($checkStmt->rowCount() === 0) {
        Response::error('Idea not found or access denied', 404);
    }

    // Build update query dynamically
    $fields = [];
    $params = ['id' => $id, 'user_id' => $userId];

    if (isset($data->title)) {
        $fields[] = "title = :title";
        $params['title'] = $data->title;
    }
    if (isset($data->content)) {
        $fields[] = "content = :content";
        $params['content'] = $data->content;
    }
    if (isset($data->status)) {
        $validStatuses = ['draft', 'recorded'];
        if (in_array($data->status, $validStatuses)) {
            $fields[] = "status = :status";
            $params['status'] = $data->status;
        }
    }

    if (empty($fields)) {
        Response::error('No fields to update', 400);
    }

    $query = "UPDATE ideas SET " . implode(', ', $fields) . " WHERE id = :id AND user_id = :user_id";
    $stmt = $conn->prepare($query);
    $stmt->execute($params);

    Response::success(['message' => 'Idea updated successfully']);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Update failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to update idea', 500);
}
