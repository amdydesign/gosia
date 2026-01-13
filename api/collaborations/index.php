<?php
/**
 * Get All Collaborations
 * GET /api/collaborations/index.php
 * 
 * Query params: ?status=pending|paid|overdue (optional filter)
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
    $sql = "SELECT * FROM collaborations WHERE user_id = :user_id";
    $params = ['user_id' => $userId];

    // Filter by payment status
    if (isset($_GET['status']) && in_array($_GET['status'], ['pending', 'paid', 'overdue'])) {
        $sql .= " AND payment_status = :status";
        $params['status'] = $_GET['status'];
    }

    // Order by date descending
    $sql .= " ORDER BY date DESC";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $collaborations = $stmt->fetchAll();

    Response::success($collaborations);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Failed to fetch collaborations: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch collaborations', 500);
}
