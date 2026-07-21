<?php
/**
 * Delete Collaboration
 * DELETE /api/collaborations/delete.php?id=1
 * 
 * Response: { "success": true, "message": "Deleted" }
 */

require_once __DIR__ . '/../bootstrap.php';
requireMethod('DELETE');

try {
    // Authenticate
    $userId = getCurrentUserId();

    // Get collaboration ID
    $id = intval($_GET['id'] ?? 0);
    if ($id <= 0) {
        Response::error('Invalid collaboration ID', 400);
    }

    $conn = db();

    // Check if collaboration exists and belongs to user
    $stmt = $conn->prepare("SELECT id FROM collaborations WHERE id = :id AND user_id = :user_id LIMIT 1");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $existing = $stmt->fetch();

    if (!$existing) {
        Response::notFound('Collaboration not found');
    }

    // Delete collaboration
    $stmt = $conn->prepare("DELETE FROM collaborations WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    Response::success(null, 'Collaboration deleted successfully');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to delete collaboration: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to delete collaboration', 500);
}
