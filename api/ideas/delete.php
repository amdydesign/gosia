<?php
/**
 * Delete Idea
 * DELETE /api/ideas/delete.php?id=1
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;

    if (!$id) {
        Response::error('ID is required', 400);
    }

    $db = new Database();
    $conn = $db->getConnection();

    $query = "DELETE FROM ideas WHERE id = :id AND user_id = :user_id";
    $stmt = $conn->prepare($query);
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    if ($stmt->rowCount() === 0) {
        Response::error('Idea not found or access denied', 404);
    }

    Response::success(['message' => 'Idea deleted successfully']);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Delete failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to delete idea', 500);
}
