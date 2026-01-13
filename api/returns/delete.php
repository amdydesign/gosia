<?php
/**
 * Delete Return
 * DELETE /api/returns/delete.php?id=1
 * 
 * Response: { "success": true, "message": "Deleted" }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

// Only allow DELETE
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    Response::error('Method not allowed', 405);
}

try {
    // Authenticate
    $userId = getCurrentUserId();

    // Get return ID
    $id = intval($_GET['id'] ?? 0);
    if ($id <= 0) {
        Response::error('Invalid return ID', 400);
    }

    // Get database connection
    $db = new Database();
    $conn = $db->getConnection();

    // Check if return exists and belongs to user
    $stmt = $conn->prepare("SELECT id FROM returns WHERE id = :id AND user_id = :user_id LIMIT 1");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $existing = $stmt->fetch();

    if (!$existing) {
        Response::notFound('Return not found');
    }

    // Delete return
    $stmt = $conn->prepare("DELETE FROM returns WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    Response::success(null, 'Return deleted successfully');

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Failed to delete return: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to delete return', 500);
}
