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

    // 1. Yearly Financials (Total Gross & Net)
    // Sum of ALL paid collaborations for current year (Official + Private)
    $stmt = $conn->prepare("
        SELECT 
            COALESCE(SUM(amount_gross), 0) as yearly_gross,
            COALESCE(SUM(amount_net), 0) as yearly_net
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status = 'paid'
        AND YEAR(date) = YEAR(CURDATE())
    ");
    $stmt->execute(['user_id' => $userId]);
    $yearlyStats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 2. Pending Payments (Gross & Net)
    // Sum of pending/overdue collaborations (All time)
    $stmt = $conn->prepare("
        SELECT 
            COALESCE(SUM(amount_gross), 0) as pending_gross,
            COALESCE(SUM(amount_net), 0) as pending_net
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status IN ('pending', 'overdue')
    ");
    $stmt->execute(['user_id' => $userId]);
    $pendingStats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 3. Yearly Counts
    // Collaborations Count (Yearly)
    $stmt = $conn->prepare("
        SELECT COUNT(*) as count 
        FROM collaborations 
        WHERE user_id = :user_id 
        AND YEAR(date) = YEAR(CURDATE())
    ");
    $stmt->execute(['user_id' => $userId]);
    $collabsYearCount = intval($stmt->fetch()['count']);

    // Purchases Count (Yearly, Kept/Partial)
    $stmt = $conn->prepare("
        SELECT COUNT(*) as count 
        FROM purchases 
        WHERE user_id = :user_id 
        AND status IN ('kept', 'partial')
        AND YEAR(purchase_date) = YEAR(CURDATE())
    ");
    $stmt->execute(['user_id' => $userId]);
    $purchasesYearCount = intval($stmt->fetch()['count']);

    // 4. Urgent Purchases (<= 3 days)
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

    // 5. Urgent Returns Badge Count (<= 7 days)
    $stmt = $conn->prepare("
        SELECT COUNT(*) as count FROM purchases 
        WHERE user_id = :user_id 
        AND status IN ('kept', 'partial')
        AND DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) BETWEEN 0 AND 7
    ");
    $stmt->execute(['user_id' => $userId]);
    $urgentReturnsCount = intval($stmt->fetch()['count']);

    // 6. Upcoming items (limit 5)
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

    // 7. Old Financials (Legacy support / Split View calculation if needed later)
    // Keeping logic simple for now as requested:
    // "official" stats are now part of Statistics page, but we can return basic year/month data if frontend needs it.
    // For now, we focus on the NEW structure.

    $stmt = $conn->prepare("
        SELECT 
            COALESCE(SUM(CASE WHEN fiscal_tracking = TRUE THEN amount_net ELSE 0 END), 0) as official_income,
            COALESCE(SUM(CASE WHEN fiscal_tracking = FALSE THEN amount_net ELSE 0 END), 0) as private_revenue
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status = 'paid'
        AND YEAR(date) = YEAR(CURDATE())
    ");
    $stmt->execute(['user_id' => $userId]);
    $splitStats = $stmt->fetch(PDO::FETCH_ASSOC);

    // Calculate tax threshold purely for metadata if needed
    $taxThreshold = 120000;
    // Costs are complex to calculate per transaction here without loop, so we approximate or omit if not used on dashboard anymore.
    // Since Dashboard removed the "Official (PIT)" card, we don't need exact tax/costs here.

    Response::success([
        'financials' => [
            'year' => date('Y'),
            'yearly_gross' => floatval($yearlyStats['yearly_gross']), // NEW
            'yearly_net' => floatval($yearlyStats['yearly_net']),     // NEW
            'pending' => [
                'gross' => floatval($pendingStats['pending_gross']),
                'net' => floatval($pendingStats['pending_net'])
            ],
            // Legacy/Extra fields for completeness
            'official' => [
                'income' => floatval($splitStats['official_income']), // Crude net approximation
                'tax_threshold_progress' => 0, // Not calculated to save perf
                'tax_threshold' => 120000
            ],
            'private' => [
                'revenue' => floatval($splitStats['private_revenue'])
            ]
        ],
        'counts' => [
            'collabs_year' => $collabsYearCount,      // NEW
            'purchases_year' => $purchasesYearCount,  // NEW
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
