<?php
/**
 * Delete Purchase
 * DELETE /api/purchases/delete.php?id=X
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
    $id = isset($_GET['id']) ? intval($_GET['id']) : null;

    if (!$id) {
        Response::error('Missing purchase ID', 400);
    }

    $db = new Database();
    $conn = $db->getConnection();

    $stmt = $conn->prepare("DELETE FROM purchases WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    if ($stmt->rowCount() > 0) {
        Response::success(['message' => 'Purchase deleted']);
    } else {
        Response::error('Purchase not found or access denied', 404);
    }

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Delete failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to delete purchase', 500);
}
