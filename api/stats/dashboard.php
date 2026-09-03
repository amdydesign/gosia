<?php
/**
 * Dashboard Statistics
 * GET /api/stats/dashboard.php
 *
 * Returns aggregated statistics for the dashboard + badge counters.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../utils/TaxCalculator.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();

    $db = new Database();
    $conn = $db->getConnection();
    $p = ['user_id' => $userId];

    // 1. Yearly financials (paid, official + private)
    $stmt = $conn->prepare("
        SELECT COALESCE(SUM(amount_gross), 0) AS yearly_gross,
               COALESCE(SUM(amount_net), 0)   AS yearly_net
        FROM collaborations
        WHERE user_id = :user_id AND payment_status = 'paid' AND YEAR(date) = YEAR(CURDATE())
    ");
    $stmt->execute($p);
    $yearlyStats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 1b. Current month financials (paid)
    $stmt = $conn->prepare("
        SELECT COALESCE(SUM(amount_gross), 0) AS month_gross,
               COALESCE(SUM(amount_net), 0)   AS month_net,
               COUNT(*)                        AS month_count
        FROM collaborations
        WHERE user_id = :user_id AND payment_status = 'paid'
          AND YEAR(date) = YEAR(CURDATE()) AND MONTH(date) = MONTH(CURDATE())
    ");
    $stmt->execute($p);
    $monthStats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 2. Pending payments (all time)
    $stmt = $conn->prepare("
        SELECT COALESCE(SUM(amount_gross), 0) AS pending_gross,
               COALESCE(SUM(amount_net), 0)   AS pending_net,
               COUNT(*)                        AS pending_count,
               SUM(CASE WHEN payment_status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count
        FROM collaborations
        WHERE user_id = :user_id AND payment_status IN ('pending', 'overdue')
    ");
    $stmt->execute($p);
    $pendingStats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 2b. Unpaid collaborations list (oldest first)
    $stmt = $conn->prepare("
        SELECT id, brand, type, collab_type, fiscal_tracking, amount_gross, amount_net, date, payment_status,
               DATEDIFF(CURDATE(), date) AS days_waiting
        FROM collaborations
        WHERE user_id = :user_id AND payment_status IN ('pending', 'overdue')
        ORDER BY FIELD(payment_status, 'overdue', 'pending'), date ASC
        LIMIT 8
    ");
    $stmt->execute($p);
    $unpaidCollabs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Yearly counts
    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM collaborations WHERE user_id = :user_id AND YEAR(date) = YEAR(CURDATE())");
    $stmt->execute($p);
    $collabsYearCount = intval($stmt->fetch()['c']);

    $stmt = $conn->prepare("
        SELECT COUNT(*) AS c FROM purchases
        WHERE user_id = :user_id AND status IN ('kept', 'partial') AND YEAR(purchase_date) = YEAR(CURDATE())
    ");
    $stmt->execute($p);
    $purchasesYearCount = intval($stmt->fetch()['c']);

    // 3b. Active returns: money still "in play" (deadline not passed)
    $stmt = $conn->prepare("
        SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS total
        FROM purchases
        WHERE user_id = :user_id AND status = 'kept'
          AND DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) >= 0
    ");
    $stmt->execute($p);
    $activeReturns = $stmt->fetch(PDO::FETCH_ASSOC);

    // 4. Urgent purchases (<= 3 days, deadline not passed more than 0 days ago)
    $stmt = $conn->prepare("
        SELECT id, store, items, purchase_date, return_days,
               DATE_ADD(purchase_date, INTERVAL return_days DAY) AS return_deadline,
               DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) AS days_remaining,
               purchase_url, amount, status
        FROM purchases
        WHERE user_id = :user_id AND status = 'kept'
          AND DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) BETWEEN 0 AND 3
        ORDER BY days_remaining ASC
    ");
    $stmt->execute($p);
    $urgentPurchases = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 5. Badge: returns due within 7 days
    $stmt = $conn->prepare("
        SELECT COUNT(*) AS c FROM purchases
        WHERE user_id = :user_id AND status = 'kept'
          AND DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) BETWEEN 0 AND 7
    ");
    $stmt->execute($p);
    $urgentReturnsCount = intval($stmt->fetch()['c']);

    // 6. Upcoming (next 7 days) unpaid collaborations
    $stmt = $conn->prepare("
        SELECT id, brand, type, amount_net AS amount, amount_gross, date, payment_status, fiscal_tracking
        FROM collaborations
        WHERE user_id = :user_id AND payment_status != 'paid'
          AND DATEDIFF(date, CURDATE()) BETWEEN 0 AND 7
        ORDER BY date ASC
        LIMIT 5
    ");
    $stmt->execute($p);
    $upcomingCollabs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $conn->prepare("
        SELECT id, store, items, purchase_date, return_days,
               DATE_ADD(purchase_date, INTERVAL return_days DAY) AS return_deadline,
               DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) AS days_remaining,
               purchase_url, amount, status
        FROM purchases
        WHERE user_id = :user_id AND status = 'kept'
          AND DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) BETWEEN 0 AND 14
        ORDER BY days_remaining ASC
        LIMIT 6
    ");
    $stmt->execute($p);
    $upcomingPurchases = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 7. Official vs private split (paid, current year) + tax threshold progress
    $stmt = $conn->prepare("
        SELECT amount_gross, amount_net, collab_type, fiscal_tracking
        FROM collaborations
        WHERE user_id = :user_id AND payment_status = 'paid' AND YEAR(date) = YEAR(CURDATE())
    ");
    $stmt->execute($p);
    $officialGross = 0.0;
    $officialIncome = 0.0; // przychód - KUP (podstawa do progu podatkowego)
    $officialNet = 0.0;
    $privateRevenue = 0.0;
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $gross = floatval($row['amount_gross']) > 0 ? floatval($row['amount_gross']) : floatval($row['amount_net']);
        if ($row['fiscal_tracking']) {
            $cType = $row['collab_type'];
            if (!$cType || $cType === 'other') {
                $cType = 'umowa_50';
            }
            $breakdown = TaxCalculator::getBreakdown($gross, $cType);
            $officialGross += $gross;
            $officialIncome += max(0, $gross - floatval($breakdown['kup']) - floatval($breakdown['commission']));
            $officialNet += floatval($row['amount_net']);
        } else {
            $privateRevenue += floatval($row['amount_net']) > 0 ? floatval($row['amount_net']) : $gross;
        }
    }
    $taxThreshold = 120000;

    // 7b. Social media snapshot (latest count per platform) + staleness flag for the app's background refresh
    $social = [];
    $socialStale = [];
    try {
        $stmt = $conn->prepare("
            SELECT s.platform, s.followers_count, s.date
            FROM social_stats s
            INNER JOIN (SELECT platform, MAX(date) AS max_date FROM social_stats WHERE user_id = :user_id GROUP BY platform) l
                ON l.platform = s.platform AND l.max_date = s.date
            WHERE s.user_id = :user_id2
        ");
        $stmt->execute(['user_id' => $userId, 'user_id2' => $userId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $social[$row['platform']] = ['count' => (int) $row['followers_count'], 'date' => $row['date']];
        }
        require_once __DIR__ . '/../config/SocialFetcher.php';
        $fetcher = new SocialFetcher($conn);
        $socialStale = $fetcher->stalePlatforms($userId);
    } catch (Exception $e) {
        // social tables optional
    }

    // 8. Ideas
    $ideasDrafts = 0;
    $nextIdea = null;
    try {
        $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM ideas WHERE user_id = :user_id AND status = 'draft'");
        $stmt->execute($p);
        $ideasDrafts = intval($stmt->fetch()['c']);
        $stmt = $conn->prepare("SELECT id, title FROM ideas WHERE user_id = :user_id AND status = 'draft' ORDER BY created_at DESC LIMIT 1");
        $stmt->execute($p);
        $nextIdea = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (Exception $e) {
        // ideas table optional on older installs
    }

    Response::success([
        'financials' => [
            'year' => date('Y'),
            'yearly_gross' => floatval($yearlyStats['yearly_gross']),
            'yearly_net' => floatval($yearlyStats['yearly_net']),
            'month' => [
                'gross' => floatval($monthStats['month_gross']),
                'net' => floatval($monthStats['month_net']),
                'count' => intval($monthStats['month_count']),
            ],
            'pending' => [
                'gross' => floatval($pendingStats['pending_gross']),
                'net' => floatval($pendingStats['pending_net']),
                'count' => intval($pendingStats['pending_count']),
                'overdue_count' => intval($pendingStats['overdue_count']),
            ],
            'official' => [
                'gross' => round($officialGross, 2),
                'income' => round($officialIncome, 2),
                'net' => round($officialNet, 2),
                'tax_threshold' => $taxThreshold,
                'tax_threshold_progress' => $taxThreshold > 0 ? round($officialIncome / $taxThreshold * 100, 1) : 0,
            ],
            'private' => [
                'revenue' => round($privateRevenue, 2),
            ],
        ],
        'counts' => [
            'collabs_year' => $collabsYearCount,
            'purchases_year' => $purchasesYearCount,
            'urgent_returns_badge' => $urgentReturnsCount,
            'overdue_payments' => intval($pendingStats['overdue_count']),
            'unpaid' => intval($pendingStats['pending_count']),
            'active_returns' => intval($activeReturns['c']),
            'active_returns_value' => floatval($activeReturns['total']),
            'ideas_drafts' => $ideasDrafts,
        ],
        'social' => $social,
        'social_stale' => $socialStale,
        'urgent_returns_count' => $urgentReturnsCount,
        'urgent_purchases' => $urgentPurchases,
        'unpaid_collaborations' => $unpaidCollabs,
        'next_idea' => $nextIdea,
        'upcoming' => [
            'collaborations' => $upcomingCollabs,
            'purchases' => $upcomingPurchases,
        ],
    ]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to fetch stats: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch statistics', 500);
}
