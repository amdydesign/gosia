<?php
/**
 * One-year summary for the Statistics screen.
 * GET /api/stats/summary.php?year=2026
 *
 * {
 *   year, years: [2026, 2025, ...],
 *   totals:  { net, gross, count },                 paid collaborations in the year
 *   pending: { gross, net, count },                 unpaid collaborations dated in the year
 *   months:  [{ month: 1..12, net, gross, count }], paid, by collaboration date
 *   tax:     { income, threshold, progress },       official income (gross - KUP - commission)
 *   cash:    private (gotówka) revenue,
 *   top_brands: [{ brand, count, net }],
 *   purchases: { returned_value, returned_count, kept_value, kept_count, active_value, active_count }
 * }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../utils/TaxCalculator.php';
require_once __DIR__ . '/../purchases/helpers.php';
require_once __DIR__ . '/../collaborations/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $currentYear = (int) date('Y');
    $year = isset($_GET['year']) ? (int) $_GET['year'] : $currentYear;
    if ($year < 2000 || $year > $currentYear + 1) {
        $year = $currentYear;
    }

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensurePurchases($conn);
    Schema::ensureCollaborations($conn);
    $p = ['user_id' => $userId, 'year' => $year, 'year2' => $year];

    // Years with data (+ current year)
    $stmt = $conn->prepare("SELECT DISTINCT YEAR(date) AS y FROM collaborations WHERE user_id = :user_id ORDER BY y DESC");
    $stmt->execute(['user_id' => $userId]);
    $years = array_map('intval', array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'y'));
    if (!in_array($currentYear, $years, true)) {
        array_unshift($years, $currentYear);
    }
    rsort($years);

    // All collaborations of the year - small enough to aggregate in PHP.
    // Paid ones count in the year the money came in (PIT counts income when received).
    $stmt = $conn->prepare("
        SELECT brand, type, collab_type, fiscal_tracking, amount_gross, amount_net, date, payment_status,
               " . COLLAB_PAID_DAY_SQL . " AS paid_day
        FROM collaborations
        WHERE user_id = :user_id
          AND ((payment_status = 'paid' AND YEAR(" . COLLAB_PAID_DAY_SQL . ") = :year)
               OR (payment_status <> 'paid' AND YEAR(date) = :year2))
    ");
    $stmt->execute($p);

    $months = [];
    for ($m = 1; $m <= 12; $m++) {
        $months[$m] = ['month' => $m, 'net' => 0.0, 'gross' => 0.0, 'count' => 0];
    }
    $totals = ['net' => 0.0, 'gross' => 0.0, 'count' => 0];
    $pending = ['net' => 0.0, 'gross' => 0.0, 'count' => 0];
    $income = 0.0;
    $cash = 0.0;
    $brands = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $gross = floatval($row['amount_gross']) > 0 ? floatval($row['amount_gross']) : floatval($row['amount_net']);
        $net = floatval($row['amount_net']) > 0 ? floatval($row['amount_net']) : $gross;

        if ($row['payment_status'] !== 'paid') {
            $pending['gross'] += $gross;
            $pending['net'] += $net;
            $pending['count']++;
            continue;
        }

        $m = (int) substr($row['paid_day'], 5, 2);
        $months[$m]['net'] += $net;
        $months[$m]['gross'] += $gross;
        $months[$m]['count']++;
        $totals['net'] += $net;
        $totals['gross'] += $gross;
        $totals['count']++;

        if ((int) $row['fiscal_tracking'] === 0) {
            $cash += $net;
        } else {
            $cType = $row['collab_type'] && $row['collab_type'] !== 'other' ? $row['collab_type'] : 'umowa_50';
            $b = TaxCalculator::getBreakdown($gross, $cType, $row['date']);
            $income += max(0, $gross - floatval($b['kup']) - floatval($b['commission']));
        }

        if ($row['type'] !== 'umowa-praca') {
            $key = mb_strtolower(trim($row['brand']));
            if (!isset($brands[$key])) {
                $brands[$key] = ['brand' => trim($row['brand']), 'count' => 0, 'net' => 0.0];
            }
            $brands[$key]['count']++;
            $brands[$key]['net'] += $net;
        }
    }

    usort($brands, function ($a, $b) {
        return $b['net'] <=> $a['net'];
    });

    // Purchases of the year
    $stmt = $conn->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN status IN ('returned', 'partial') THEN GREATEST(returned_amount - COALESCE(return_cost, 0), 0) ELSE 0 END), 0) AS returned_value,
            SUM(CASE WHEN status IN ('returned', 'partial') THEN 1 ELSE 0 END) AS returned_count,
            COALESCE(SUM(CASE WHEN status = 'kept' AND (kept_confirmed = 1 OR " . PURCHASE_DEADLINE_SQL . " < CURDATE()) THEN amount
                              WHEN status = 'partial' THEN GREATEST(amount - returned_amount, 0) ELSE 0 END), 0) AS kept_value,
            SUM(CASE WHEN status = 'kept' AND (kept_confirmed = 1 OR " . PURCHASE_DEADLINE_SQL . " < CURDATE()) THEN 1 ELSE 0 END) AS kept_count,
            COALESCE(SUM(CASE WHEN status = 'kept' AND kept_confirmed = 0 AND " . PURCHASE_DEADLINE_SQL . " >= CURDATE() THEN amount ELSE 0 END), 0) AS active_value,
            SUM(CASE WHEN status = 'kept' AND kept_confirmed = 0 AND " . PURCHASE_DEADLINE_SQL . " >= CURDATE() THEN 1 ELSE 0 END) AS active_count
        FROM purchases
        WHERE user_id = :user_id AND YEAR(purchase_date) = :year
    ");
    $stmt->execute(['user_id' => $userId, 'year' => $year]);
    $pur = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $threshold = 120000;
    $money = function ($bucket) {
        return ['net' => round($bucket['net'], 2), 'gross' => round($bucket['gross'], 2), 'count' => $bucket['count']];
    };

    Response::success([
        'year' => $year,
        'years' => $years,
        'totals' => $money($totals),
        'pending' => $money($pending),
        'months' => array_values(array_map(function ($m) {
            return ['month' => $m['month'], 'net' => round($m['net'], 2), 'gross' => round($m['gross'], 2), 'count' => $m['count']];
        }, $months)),
        'tax' => [
            'income' => round($income, 2),
            'threshold' => $threshold,
            'progress' => round($income / $threshold * 100, 1),
        ],
        'cash' => round($cash, 2),
        'top_brands' => array_map(function ($b) {
            return ['brand' => $b['brand'], 'count' => $b['count'], 'net' => round($b['net'], 2)];
        }, array_slice($brands, 0, 5)),
        'purchases' => [
            'returned_value' => round(floatval($pur['returned_value'] ?? 0), 2),
            'returned_count' => intval($pur['returned_count'] ?? 0),
            'kept_value' => round(floatval($pur['kept_value'] ?? 0), 2),
            'kept_count' => intval($pur['kept_count'] ?? 0),
            'active_value' => round(floatval($pur['active_value'] ?? 0), 2),
            'active_count' => intval($pur['active_count'] ?? 0),
        ],
    ]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to fetch summary: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch statistics', 500);
}
