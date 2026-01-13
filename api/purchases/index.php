<?php
/**
 * Get Purchases List
 * GET /api/purchases/index.php
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
    $status = isset($_GET['status']) ? $_GET['status'] : 'all'; // all, kept, returned, partial
    $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 50;

    $db = new Database();
    $conn = $db->getConnection();

    $query = "
        SELECT 
            id, store, items, purchase_date, return_days, 
            amount, returned_amount, purchase_url, notes, status, 
            DATE_ADD(purchase_date, INTERVAL return_days DAY) as return_deadline,
            DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) as days_remaining,
            created_at
        FROM purchases 
        WHERE user_id = :user_id
    ";

    $params = ['user_id' => $userId];

    if ($status !== 'all') {
        $query .= " AND status = :status";
        $params['status'] = $status;
    }

    // Sort: Urgent items first (if kept), otherwise new first
    $query .= " ORDER BY CASE WHEN status = 'kept' THEN days_remaining ELSE 9999 END ASC, created_at DESC LIMIT :limit";

    // Prepare needs to handle LIMIT with bindValue/bindParam for INT (PDO quirk)
    // Safer to just embed limit if it's sanitized intval
    $query = str_replace(':limit', $limit, $query);

    $stmt = $conn->prepare($query);
    $stmt->execute($params);
    $purchases = $stmt->fetchAll(PDO::FETCH_ASSOC);

    Response::success($purchases);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Fetch failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch purchases', 500);
}
