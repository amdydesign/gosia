<?php
/**
 * Delete Idea
 * DELETE /api/ideas/delete.php?id=1
 */

require_once __DIR__ . '/../bootstrap.php';
requireMethod('DELETE');

try {
    $userId = getCurrentUserId();
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;

    if (!$id) {
        Response::error('ID is required', 400);
    }

    $conn = db();

    $query = "DELETE FROM ideas WHERE id = :id AND user_id = :user_id";
    $stmt = $conn->prepare($query);
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    if ($stmt->rowCount() === 0) {
        Response::error('Idea not found or access denied', 404);
    }

    Response::success(['message' => 'Idea deleted successfully']);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Delete failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to delete idea', 500);
}
