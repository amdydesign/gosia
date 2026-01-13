<?php
/**
 * Get Single Purchase
 * GET /api/purchases/show.php?id=X
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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

    $stmt = $conn->prepare("
        SELECT 
            id, store, items, purchase_date, return_days, 
            amount, returned_amount, purchase_url, notes, status, 
            DATE_ADD(purchase_date, INTERVAL return_days DAY) as return_deadline,
            DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) as days_remaining,
            created_at, returned_at
        FROM purchases 
        WHERE id = :id AND user_id = :user_id
    ");

    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $purchase = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($purchase) {
        Response::success($purchase);
    } else {
        Response::error('Purchase not found', 404);
    }

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Fetch failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch purchase', 500);
}
