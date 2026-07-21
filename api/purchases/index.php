<?php
/**
 * Get Purchases List
 * GET /api/purchases/index.php
 */

require_once __DIR__ . '/../bootstrap.php';
requireMethod('GET');

try {
    $userId = getCurrentUserId();
    $status = isset($_GET['status']) ? $_GET['status'] : 'all'; // all, kept, returned, partial
    if ($status !== 'all') {
        Validator::requireEnum($status, Validator::PURCHASE_STATUSES, 'status');
    }
    $limit = isset($_GET['limit']) ? max(1, min(500, intval($_GET['limit']))) : 50;

    $conn = db();

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

    $stmt = $conn->prepare($query);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $purchases = $stmt->fetchAll(PDO::FETCH_ASSOC);

    Response::success($purchases);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Fetch failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch purchases', 500);
}
