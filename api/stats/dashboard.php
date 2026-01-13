<?php
/**
 * Dashboard Statistics
 * GET /api/stats/dashboard.php
 * 
 * Returns aggregated statistics for the dashboard
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

    // Get current month earnings (paid only) - using amount_net
    $stmt = $conn->prepare("
        SELECT COALESCE(SUM(amount_net), 0) as total
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status = 'paid'
        AND YEAR(date) = YEAR(CURDATE()) 
        AND MONTH(date) = MONTH(CURDATE())
    ");
    $stmt->execute(['user_id' => $userId]);
    $monthlyEarnings = floatval($stmt->fetch()['total']);

    // Get current year earnings (paid only) - using amount_net
    $stmt = $conn->prepare("
        SELECT COALESCE(SUM(amount_net), 0) as total
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status = 'paid'
        AND YEAR(date) = YEAR(CURDATE())
    ");
    $stmt->execute(['user_id' => $userId]);
    $yearlyEarnings = floatval($stmt->fetch()['total']);

    // Get pending payments
    $stmt = $conn->prepare("
        SELECT COALESCE(SUM(amount_net), 0) as total
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status IN ('pending', 'overdue')
    ");
    $stmt->execute(['user_id' => $userId]);
    $pendingPayments = floatval($stmt->fetch()['total']);

    // Get active collaborations count
    $stmt = $conn->prepare("
        SELECT COUNT(*) as count
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status != 'paid'
    ");
    $stmt->execute(['user_id' => $userId]);
    $activeCollabs = intval($stmt->fetch()['count']);

    // Get active purchases count (formerly pending returns) -> status = 'kept' or 'partial'
    $stmt = $conn->prepare("
        SELECT COUNT(*) as count
        FROM purchases 
        WHERE user_id = :user_id 
        AND status IN ('kept', 'partial')
    ");
    $stmt->execute(['user_id' => $userId]);
    $activePurchases = intval($stmt->fetch()['count']);

    // Get urgent purchases to return (3 days or less)
    $stmt = $conn->prepare("
        SELECT id, store, items, purchase_date, return_days,
               DATE_ADD(purchase_date, INTERVAL return_days DAY) as return_deadline,
               DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) as days_remaining,
               purchase_url, amount, status
        FROM purchases 
        WHERE user_id = :user_id 
        AND status IN ('kept', 'partial')
        AND DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) <= 3
        ORDER BY days_remaining ASC
    ");
    $stmt->execute(['user_id' => $userId]);
    $urgentPurchases = $stmt->fetchAll();

    // Get upcoming items (next 7 days)
    $upcomingCollabs = [];
    $stmt = $conn->prepare("
        SELECT id, brand, type, amount_net as amount, date, payment_status
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status != 'paid'
        AND DATEDIFF(date, CURDATE()) BETWEEN 0 AND 7
        ORDER BY date ASC
        LIMIT 5
    ");
    $stmt->execute(['user_id' => $userId]);
    $upcomingCollabs = $stmt->fetchAll();

    $upcomingPurchases = [];
    $stmt = $conn->prepare("
        SELECT id, store, items, purchase_date, return_days,
               DATE_ADD(purchase_date, INTERVAL return_days DAY) as return_deadline,
               DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) as days_remaining,
               purchase_url, amount, status
        FROM purchases 
        WHERE user_id = :user_id 
        AND status IN ('kept', 'partial')
        AND DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) <= 14
        ORDER BY days_remaining ASC
        LIMIT 5
    ");
    $stmt->execute(['user_id' => $userId]);
    $upcomingPurchases = $stmt->fetchAll();

    // Get total statistics (all time)
    $stmt = $conn->prepare("
        SELECT 
            COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount_net ELSE 0 END), 0) as total_earnings,
            COUNT(*) as total_collaborations
        FROM collaborations 
        WHERE user_id = :user_id
    ");
    $stmt->execute(['user_id' => $userId]);
    $totals = $stmt->fetch();

    Response::success([
        'monthly_earnings' => $monthlyEarnings,
        'yearly_earnings' => $yearlyEarnings,
        'pending_payments' => $pendingPayments,
        'active_collaborations' => $activeCollabs,
        'active_purchases' => $activePurchases, // Renamed from pending_returns
        'urgent_purchases' => $urgentPurchases, // Renamed from urgent_returns
        'upcoming_collaborations' => $upcomingCollabs,
        'upcoming_purchases' => $upcomingPurchases, // Renamed from upcoming_returns
        'total_earnings' => floatval($totals['total_earnings']),
        'total_collaborations' => intval($totals['total_collaborations'])
    ]);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Failed to fetch stats: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch statistics', 500);
}
