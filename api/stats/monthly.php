<?php
/**
 * Monthly Earnings Chart Data
 * GET /api/stats/monthly.php
 * 
 * Returns earnings by month for the last 6 months
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

    // Get earnings by month for last 6 months
    $stmt = $conn->prepare("
        SELECT 
            DATE_FORMAT(date, '%Y-%m') as month,
            YEAR(date) as year,
            MONTH(date) as month_num,
            COALESCE(SUM(amount_net), 0) as total
        FROM collaborations 
        WHERE user_id = :user_id 
        AND payment_status = 'paid'
        AND date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(date, '%Y-%m'), YEAR(date), MONTH(date)
        ORDER BY year ASC, month_num ASC
    ");
    $stmt->execute(['user_id' => $userId]);
    $results = $stmt->fetchAll();

    // Fill in missing months
    $months = [];
    $monthNames = [
        1 => 'Styczeń',
        2 => 'Luty',
        3 => 'Marzec',
        4 => 'Kwiecień',
        5 => 'Maj',
        6 => 'Czerwiec',
        7 => 'Lipiec',
        8 => 'Sierpień',
        9 => 'Wrzesień',
        10 => 'Październik',
        11 => 'Listopad',
        12 => 'Grudzień'
    ];

    // Create lookup from results
    $lookup = [];
    foreach ($results as $row) {
        $lookup[$row['month']] = floatval($row['total']);
    }

    // Generate last 6 months
    for ($i = 5; $i >= 0; $i--) {
        $date = strtotime("-$i months");
        $key = date('Y-m', $date);
        $monthNum = intval(date('n', $date));

        $months[] = [
            'month' => $key,
            'label' => $monthNames[$monthNum],
            'value' => $lookup[$key] ?? 0
        ];
    }

    // Get breakdown by type
    $stmt = $conn->prepare("
        SELECT 
            type,
            COUNT(*) as count,
            COALESCE(SUM(amount_net), 0) as total,
            COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount_net ELSE 0 END), 0) as paid_total
        FROM collaborations 
        WHERE user_id = :user_id
        GROUP BY type
        ORDER BY total DESC
    ");
    $stmt->execute(['user_id' => $userId]);
    $typeBreakdown = $stmt->fetchAll();

    Response::success([
        'monthly' => $months,
        'by_type' => $typeBreakdown
    ]);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Failed to fetch monthly stats: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch statistics', 500);
}
