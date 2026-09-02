<?php
/**
 * Monthly Earnings Chart Data
 * GET /api/stats/monthly.php?months=6
 *
 * Returns paid earnings per month for the last N months (default 6, max 24)
 * plus a breakdown by collaboration type.
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
    $months = isset($_GET['months']) ? intval($_GET['months']) : 6;
    $months = max(1, min(24, $months));

    $db = new Database();
    $conn = $db->getConnection();

    // First day of the oldest month in range
    $firstOfCurrent = date('Y-m-01');
    $rangeStart = date('Y-m-01', strtotime($firstOfCurrent . ' -' . ($months - 1) . ' months'));

    $stmt = $conn->prepare("
        SELECT DATE_FORMAT(date, '%Y-%m') AS month,
               COALESCE(SUM(amount_net), 0)   AS total,
               COALESCE(SUM(amount_gross), 0) AS total_gross,
               COUNT(*) AS count
        FROM collaborations
        WHERE user_id = :user_id
          AND payment_status = 'paid'
          AND date >= :range_start
        GROUP BY DATE_FORMAT(date, '%Y-%m')
        ORDER BY month ASC
    ");
    $stmt->execute(['user_id' => $userId, 'range_start' => $rangeStart]);
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $monthNames = [
        1 => 'Styczeń', 2 => 'Luty', 3 => 'Marzec', 4 => 'Kwiecień', 5 => 'Maj', 6 => 'Czerwiec',
        7 => 'Lipiec', 8 => 'Sierpień', 9 => 'Wrzesień', 10 => 'Październik', 11 => 'Listopad', 12 => 'Grudzień'
    ];
    $shortNames = [
        1 => 'Sty', 2 => 'Lut', 3 => 'Mar', 4 => 'Kwi', 5 => 'Maj', 6 => 'Cze',
        7 => 'Lip', 8 => 'Sie', 9 => 'Wrz', 10 => 'Paź', 11 => 'Lis', 12 => 'Gru'
    ];

    $lookup = [];
    foreach ($results as $row) {
        $lookup[$row['month']] = $row;
    }

    $out = [];
    for ($i = $months - 1; $i >= 0; $i--) {
        $ts = strtotime($firstOfCurrent . " -$i months");
        $key = date('Y-m', $ts);
        $monthNum = intval(date('n', $ts));
        $row = $lookup[$key] ?? null;

        $out[] = [
            'month' => $key,
            'year' => intval(date('Y', $ts)),
            'label' => $monthNames[$monthNum],
            'short' => $shortNames[$monthNum] . ($months > 12 ? ' ' . date('y', $ts) : ''),
            'value' => $row ? floatval($row['total']) : 0,
            'gross' => $row ? floatval($row['total_gross']) : 0,
            'count' => $row ? intval($row['count']) : 0,
        ];
    }

    // Breakdown by type (current year, all statuses; paid_total for reference)
    $stmt = $conn->prepare("
        SELECT type,
               COUNT(*) AS count,
               COALESCE(SUM(amount_net), 0) AS total,
               COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount_net ELSE 0 END), 0) AS paid_total
        FROM collaborations
        WHERE user_id = :user_id AND YEAR(date) = YEAR(CURDATE())
        GROUP BY type
        ORDER BY total DESC
    ");
    $stmt->execute(['user_id' => $userId]);
    $typeBreakdown = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Top brands (current year)
    $stmt = $conn->prepare("
        SELECT brand, COUNT(*) AS count, COALESCE(SUM(amount_gross), 0) AS total
        FROM collaborations
        WHERE user_id = :user_id AND YEAR(date) = YEAR(CURDATE()) AND type != 'umowa-praca'
        GROUP BY brand
        ORDER BY total DESC
        LIMIT 5
    ");
    $stmt->execute(['user_id' => $userId]);
    $topBrands = $stmt->fetchAll(PDO::FETCH_ASSOC);

    Response::success([
        'months' => $months,
        'monthly' => $out,
        'by_type' => $typeBreakdown,
        'top_brands' => $topBrands,
    ]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to fetch monthly stats: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch statistics', 500);
}
