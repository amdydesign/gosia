<?php
/**
 * Get All Returns
 * GET /api/returns/index.php
 * 
 * Query params: ?status=pending|returned (optional filter)
 * Response: { "success": true, "data": [...] }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

// Only allow GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    // Authenticate
    $userId = getCurrentUserId();

    // Get database connection
    $db = new Database();
    $conn = $db->getConnection();

    // Build query with optional filter
    $sql = "SELECT *, 
            DATE_ADD(purchase_date, INTERVAL return_days DAY) as return_deadline,
            DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) as days_remaining
            FROM returns WHERE user_id = :user_id";
    $params = ['user_id' => $userId];

    // Filter by status
    if (isset($_GET['status']) && in_array($_GET['status'], ['pending', 'returned'])) {
        $sql .= " AND status = :status";
        $params['status'] = $_GET['status'];
    }

    // Order by urgency (days remaining)
    $sql .= " ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, 
              DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) ASC";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $returns = $stmt->fetchAll();

    Response::success($returns);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Failed to fetch returns: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch returns', 500);
}
