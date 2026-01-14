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
require_once __DIR__ . '/../utils/TaxCalculator.php';

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

    // 1. Official Financials (Yearly) - Fiscal Tracking = TRUE
    // We fetch all paid official collaborations for current year to calculate exact tax stats
    $stmt = $conn->prepare("
        SELECT amount_net, collab_type
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status = 'paid'
        AND fiscal_tracking = TRUE
        AND YEAR(date) = YEAR(CURDATE())
    ");
    $stmt->execute(['user_id' => $userId]);
    $officialCollabs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $officialRevenue = 0;
    $officialCosts = 0; // KUP + Use.me commissions
    $officialIncome = 0; // Dochód (Revenue - Costs)

    foreach ($officialCollabs as $collab) {
        $gross = floatval($collab['amount_net']); // Assuming amount_net is the base for calculation
        $breakdown = TaxCalculator::getBreakdown($gross, $collab['collab_type']);

        $officialRevenue += $gross;
        $officialCosts += ($breakdown['kup'] + $breakdown['commission']);
    }

    $officialIncome = $officialRevenue - $officialCosts;
    $taxThreshold = 120000;
    $taxThresholdProgress = min(100, ($officialIncome / $taxThreshold) * 100);

    // 2. Private Cash (Yearly) - Fiscal Tracking = FALSE
    $stmt = $conn->prepare("
        SELECT COALESCE(SUM(amount_net), 0) as total
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status = 'paid'
        AND fiscal_tracking = FALSE
        AND YEAR(date) = YEAR(CURDATE())
    ");
    $stmt->execute(['user_id' => $userId]);
    $privateRevenue = floatval($stmt->fetch()['total']);

    // 3. Monthly Earnings (Official + Private split)
    $stmt = $conn->prepare("
        SELECT 
            COALESCE(SUM(CASE WHEN fiscal_tracking = TRUE THEN amount_net ELSE 0 END), 0) as official,
            COALESCE(SUM(CASE WHEN fiscal_tracking = FALSE THEN amount_net ELSE 0 END), 0) as private
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status = 'paid'
        AND YEAR(date) = YEAR(CURDATE()) 
        AND MONTH(date) = MONTH(CURDATE())
    ");
    $stmt->execute(['user_id' => $userId]);
    $monthlyStats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 4. Pending Payments (Total)
    $stmt = $conn->prepare("
        SELECT COALESCE(SUM(amount_net), 0) as total
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status IN ('pending', 'overdue')
    ");
    $stmt->execute(['user_id' => $userId]);
    $pendingPayments = floatval($stmt->fetch()['total']);

    // 5. Active items counts
    $stmt = $conn->prepare("
        SELECT COUNT(*) as count FROM collaborations 
        WHERE user_id = :user_id AND payment_status != 'paid'
    ");
    $stmt->execute(['user_id' => $userId]);
    $activeCollabs = intval($stmt->fetch()['count']);

    $stmt = $conn->prepare("
        SELECT COUNT(*) as count FROM purchases 
        WHERE user_id = :user_id AND status IN ('kept', 'partial')
    ");
    $stmt->execute(['user_id' => $userId]);
    $activePurchases = intval($stmt->fetch()['count']);

    // 6. Urgent Purchases (<= 3 days)
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
    $urgentPurchases = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 7. Badge count (<= 7 days)
    $stmt = $conn->prepare("
        SELECT COUNT(*) as count FROM purchases 
        WHERE user_id = :user_id 
        AND status IN ('kept', 'partial')
        AND DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) BETWEEN 0 AND 7
    ");
    $stmt->execute(['user_id' => $userId]);
    $urgentReturnsCount = intval($stmt->fetch()['count']);

    // 8. Upcoming items (Collaborations & Purchases)
    $stmt = $conn->prepare("
        SELECT id, brand, type, amount_net as amount, date, payment_status, fiscal_tracking
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status != 'paid'
        AND DATEDIFF(date, CURDATE()) BETWEEN 0 AND 7
        ORDER BY date ASC
        LIMIT 5
    ");
    $stmt->execute(['user_id' => $userId]);
    $upcomingCollabs = $stmt->fetchAll(PDO::FETCH_ASSOC);

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
    $upcomingPurchases = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 9. Total Earnings (All time)
    $stmt = $conn->prepare("
        SELECT 
            COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount_net ELSE 0 END), 0) as total_earnings,
            COUNT(*) as total_collaborations
        FROM collaborations 
        WHERE user_id = :user_id
    ");
    $stmt->execute(['user_id' => $userId]);
    $totals = $stmt->fetch(PDO::FETCH_ASSOC);

    Response::success([
        'financials' => [
            'year' => date('Y'),
            'official' => [
                'revenue' => $officialRevenue,
                'costs' => $officialCosts,
                'income' => $officialIncome,
                'tax_threshold_progress' => $taxThresholdProgress,
                'tax_threshold' => $taxThreshold
            ],
            'private' => [
                'revenue' => $privateRevenue,
                'count' => 0 // Calculated on frontend or separate query if needed
            ],
            'monthly' => [
                'official' => floatval($monthlyStats['official']),
                'private' => floatval($monthlyStats['private']),
                'total' => floatval($monthlyStats['official']) + floatval($monthlyStats['private'])
            ],
            'pending' => $pendingPayments,
            'total_all_time' => floatval($totals['total_earnings'])
        ],
        'active_counts' => [
            'collaborations' => $activeCollabs,
            'purchases' => $activePurchases,
            'urgent_returns_badge' => $urgentReturnsCount
        ],
        'urgent_purchases' => $urgentPurchases,
        'upcoming' => [
            'collaborations' => $upcomingCollabs,
            'purchases' => $upcomingPurchases
        ]
    ]);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Failed to fetch stats: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch statistics', 500);
}
