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
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../utils/DoneLog.php';
require_once __DIR__ . '/../utils/TodayAgenda.php';
require_once __DIR__ . '/../purchases/helpers.php';
require_once __DIR__ . '/../collaborations/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensurePurchases($conn);
    Schema::ensureCollaborations($conn);
    $p = ['user_id' => $userId];

    // 1. Yearly financials (paid, official + private)
    $stmt = $conn->prepare("
        SELECT COALESCE(SUM(amount_gross), 0) AS yearly_gross,
               COALESCE(SUM(amount_net), 0)   AS yearly_net
        FROM collaborations
        WHERE user_id = :user_id AND payment_status = 'paid' AND YEAR(" . COLLAB_PAID_DAY_SQL . ") = YEAR(CURDATE())
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
          AND YEAR(" . COLLAB_PAID_DAY_SQL . ") = YEAR(CURDATE()) AND MONTH(" . COLLAB_PAID_DAY_SQL . ") = MONTH(CURDATE())
    ");
    $stmt->execute($p);
    $monthStats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 2. Pending payments (all time) - "czeka na przelew" = work done, money not in yet
    //    (with things from the brief still to make nothing is awaited or late)
    $stmt = $conn->prepare("
        SELECT amount_gross, amount_net, published_at, deliverables,
               (payment_status = 'overdue' OR " . COLLAB_DUE_SQL . " < CURDATE()) AS is_overdue
        FROM collaborations
        WHERE user_id = :user_id AND payment_status IN ('pending', 'overdue') AND (stage IS NULL OR stage <> 'brief')
    ");
    $stmt->execute($p);
    $pendingStats = ['pending_gross' => 0, 'pending_net' => 0, 'pending_count' => 0, 'overdue_count' => 0];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if (collabHasWorkLeft($row)) {
            continue;
        }
        $pendingStats['pending_gross'] += (float) $row['amount_gross'];
        $pendingStats['pending_net'] += (float) $row['amount_net'];
        $pendingStats['pending_count']++;
        $pendingStats['overdue_count'] += (int) $row['is_overdue'];
    }

    // 2b. Unpaid collaborations list (oldest first)
    $stmt = $conn->prepare("
        SELECT id, brand, type, collab_type, fiscal_tracking, amount_gross, amount_net, date, payment_status,
               DATEDIFF(CURDATE(), date) AS days_waiting, " . COLLAB_DUE_SQL . " AS payment_due
        FROM collaborations
        WHERE user_id = :user_id AND payment_status IN ('pending', 'overdue') AND (stage IS NULL OR stage <> 'brief')
        ORDER BY date ASC
        LIMIT 10
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
        WHERE user_id = :user_id AND status = 'kept' AND kept_confirmed = 0
          AND DATEDIFF(" . PURCHASE_DEADLINE_SQL . ", CURDATE()) >= 0
    ");
    $stmt->execute($p);
    $activeReturns = $stmt->fetch(PDO::FETCH_ASSOC);

    // 4. Urgent purchases (<= 3 days, deadline not passed more than 0 days ago)
    $stmt = $conn->prepare("
        SELECT id, store, items, purchase_date, return_days,
               " . PURCHASE_DEADLINE_SQL . " AS return_deadline,
               DATEDIFF(" . PURCHASE_DEADLINE_SQL . ", CURDATE()) AS days_remaining,
               purchase_url, amount, status
        FROM purchases
        WHERE user_id = :user_id AND status = 'kept' AND kept_confirmed = 0
          AND DATEDIFF(" . PURCHASE_DEADLINE_SQL . ", CURDATE()) BETWEEN 0 AND 3
        ORDER BY days_remaining ASC
    ");
    $stmt->execute($p);
    $urgentPurchases = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 5. Badge: returns due within 7 days
    $stmt = $conn->prepare("
        SELECT COUNT(*) AS c FROM purchases
        WHERE user_id = :user_id AND status = 'kept' AND kept_confirmed = 0
          AND DATEDIFF(" . PURCHASE_DEADLINE_SQL . ", CURDATE()) BETWEEN 0 AND 7
    ");
    $stmt->execute($p);
    $urgentReturnsCount = intval($stmt->fetch()['c']);

    // 6. Upcoming (next 7 days) unpaid collaborations
    $stmt = $conn->prepare("
        SELECT id, brand, type, amount_net AS amount, amount_gross, date, payment_status, fiscal_tracking
        FROM collaborations
        WHERE user_id = :user_id AND payment_status != 'paid' AND (stage IS NULL OR stage <> 'brief')
          AND DATEDIFF(date, CURDATE()) BETWEEN 0 AND 7
        ORDER BY date ASC
        LIMIT 5
    ");
    $stmt->execute($p);
    $upcomingCollabs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $conn->prepare("
        SELECT id, store, items, purchase_date, return_days,
               " . PURCHASE_DEADLINE_SQL . " AS return_deadline,
               DATEDIFF(" . PURCHASE_DEADLINE_SQL . ", CURDATE()) AS days_remaining,
               purchase_url, amount, status
        FROM purchases
        WHERE user_id = :user_id AND status = 'kept' AND kept_confirmed = 0
          AND DATEDIFF(" . PURCHASE_DEADLINE_SQL . ", CURDATE()) BETWEEN 0 AND 14
        ORDER BY days_remaining ASC
        LIMIT 6
    ");
    $stmt->execute($p);
    $upcomingPurchases = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 7. Official vs private split (paid, current year) + tax threshold progress
    $stmt = $conn->prepare("
        SELECT amount_gross, amount_net, collab_type, fiscal_tracking, date
        FROM collaborations
        WHERE user_id = :user_id AND payment_status = 'paid' AND YEAR(" . COLLAB_PAID_DAY_SQL . ") = YEAR(CURDATE())
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
            $breakdown = TaxCalculator::getBreakdown($gross, $cType, $row['date']);
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

    // 7c. Screenshot reading (AI) availability
    try {
        AiSettings::apply($conn, $userId);
    } catch (Exception $e) {
        // settings table optional - fall back to api/.env keys
    }

    // 8. Ideas (drafts to record)
    $ideasDrafts = 0;
    $nextIdea = null;
    $draftIdeas = [];
    try {
        Schema::ensureColumn($conn, 'ideas', 'planned_for');
        $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM ideas WHERE user_id = :user_id AND status = 'draft'");
        $stmt->execute($p);
        $ideasDrafts = intval($stmt->fetch()['c']);
        $stmt = $conn->prepare("
            SELECT id, title, created_at, planned_for,
                   CASE WHEN content IS NULL OR content = '' THEN 0
                        ELSE LENGTH(TRIM(content)) - LENGTH(REPLACE(TRIM(content), ' ', '')) + 1 END AS words
            FROM ideas
            WHERE user_id = :user_id AND status = 'draft'
            ORDER BY created_at DESC
            LIMIT 4
        ");
        $stmt->execute($p);
        $draftIdeas = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($draftIdeas as &$idea) {
            $idea['words'] = intval($idea['words']);
        }
        unset($idea);
        $nextIdea = $draftIdeas[0] ?? null;
    } catch (Exception $e) {
        // ideas table optional on older installs
    }

    // 9. Start (ADHD view): open tasks, snoozed things, what got done today
    $tasks = [];
    $snoozed = [];
    $doneToday = [];
    try {
        Schema::ensure($conn, 'tasks');
        $stmt = $conn->prepare("
            SELECT id, title, due_date FROM tasks
            WHERE user_id = :user_id AND done_at IS NULL AND (due_date IS NULL OR due_date <= :soon)
            ORDER BY due_date IS NULL, due_date ASC, id ASC
            LIMIT 20
        ");
        $stmt->execute(['user_id' => $userId, 'soon' => date('Y-m-d', strtotime('+7 days'))]);
        $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Schema::ensure($conn, 'reminders');
        $stmt = $conn->prepare("
            SELECT ref_key, title, remind_at FROM reminders
            WHERE user_id = :user_id AND sent_at IS NULL AND remind_at > :now
            ORDER BY remind_at ASC
        ");
        $stmt->execute(['user_id' => $userId, 'now' => date('Y-m-d H:i:s')]);
        $snoozed = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $doneToday = DoneLog::today($conn, $userId);
    } catch (Exception $e) {
        // new tables are created on first use - Start still works without them
    }

    // 10. Net earnings per month, last 12 months (bars on Start)
    $stmt = $conn->prepare("
        SELECT DATE_FORMAT(" . COLLAB_PAID_DAY_SQL . ", '%Y-%m') AS ym, COALESCE(SUM(amount_net), 0) AS net
        FROM collaborations
        WHERE user_id = :user_id AND payment_status = 'paid' AND " . COLLAB_PAID_DAY_SQL . " >= :from
        GROUP BY ym
    ");
    $stmt->execute(['user_id' => $userId, 'from' => date('Y-m-01', strtotime('first day of -11 months'))]);
    $byMonth = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'net', 'ym');
    $months = [];
    for ($i = 11; $i >= 0; $i--) {
        $ym = date('Y-m', strtotime("first day of -{$i} months"));
        $months[] = ['month' => $ym, 'net' => round((float) ($byMonth[$ym] ?? 0), 2)];
    }

    $agenda = TodayAgenda::build($conn, $userId);

    // Active exclusivities from contracts - the collaboration form warns before a competitor
    $exclusivities = [];
    try {
        require_once __DIR__ . '/../documents/helpers.php';
        documentsEnsureSchema($conn);
        $stmt = $conn->prepare("SELECT id, title, brand, counterparty, terms FROM documents WHERE user_id = :user_id AND terms LIKE '%exclusivity_until%'");
        $stmt->execute($p);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $doc) {
            $terms = documentsTerms($doc['terms']);
            if (!empty($terms['exclusivity_until']) && $terms['exclusivity_until'] >= date('Y-m-d')) {
                $exclusivities[] = [
                    'document_id' => (int) $doc['id'],
                    'brand' => trim((string) $doc['brand']) ?: (documentsShortName($doc['counterparty']) ?: $doc['title']),
                    'until' => $terms['exclusivity_until'],
                    'scope' => $terms['exclusivity_scope'] ?? '',
                ];
            }
        }
    } catch (Exception $e) {
        // no document archive yet
    }

    // 11. "Przegląd tygodnia" (Mon-Tue until done): last week's money, what is due this week
    $weekReview = null;
    $weekKey = 'review:' . date('o-\WW');
    $dayOfWeek = (int) date('N');
    Schema::ensure($conn, 'done_log');
    $stmt = $conn->prepare("SELECT 1 FROM done_log WHERE user_id = :user_id AND ref_key = :k LIMIT 1");
    $stmt->execute(['user_id' => $userId, 'k' => $weekKey]);
    $reviewDone = (bool) $stmt->fetchColumn();
    if ($dayOfWeek <= 2 && !$reviewDone) {
        $monday = date('Y-m-d', strtotime('monday this week'));
        $sunday = date('Y-m-d', strtotime('sunday this week'));
        $stmt = $conn->prepare("
            SELECT COALESCE(SUM(amount_net), 0) AS net, COUNT(*) AS c FROM collaborations
            WHERE user_id = :user_id AND payment_status = 'paid'
              AND " . COLLAB_PAID_DAY_SQL . " BETWEEN DATE_SUB(:monday, INTERVAL 7 DAY) AND DATE_SUB(:monday2, INTERVAL 1 DAY)
        ");
        $stmt->execute(['user_id' => $userId, 'monday' => $monday, 'monday2' => $monday]);
        $lastWeek = $stmt->fetch(PDO::FETCH_ASSOC);

        // deadlines this week: publish, payments due, returns, contract dates, tasks
        $due = [];
        foreach ($agenda as $item) {
            if (!empty($item['deadline']) && $item['deadline'] >= date('Y-m-d') && $item['deadline'] <= $sunday && $item['kind'] !== 'idea') {
                $due[] = ['kind' => $item['kind'], 'title' => $item['title'], 'date' => $item['deadline'], 'url' => $item['url']];
            }
        }
        $stmt = $conn->prepare("
            SELECT id, brand, published_at, deliverables, " . COLLAB_DUE_SQL . " AS due FROM collaborations
            WHERE user_id = :user_id AND payment_status IN ('pending', 'overdue') AND (stage IS NULL OR stage <> 'brief')
              AND " . COLLAB_DUE_SQL . " BETWEEN CURDATE() AND :sunday
        ");
        $stmt->execute(['user_id' => $userId, 'sunday' => $sunday]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (collabHasWorkLeft($row)) {
                continue;
            }
            $due[] = ['kind' => 'payment_due', 'title' => $row['brand'] . ' — termin płatności', 'date' => $row['due'], 'url' => '/collaborations/' . $row['id']];
        }
        usort($due, function ($a, $b) {
            return strcmp($a['date'], $b['date']);
        });

        $late = count(array_filter($agenda, function ($i) {
            return !empty($i['late']);
        }));
        if ((float) $lastWeek['net'] > 0 || $due || $late || (int) $pendingStats['pending_count'] > 0) {
            $weekReview = [
                'key' => $weekKey,
                'paid_last_week' => ['net' => round((float) $lastWeek['net'], 2), 'count' => (int) $lastWeek['c']],
                'waiting' => ['gross' => floatval($pendingStats['pending_gross']), 'count' => intval($pendingStats['pending_count'])],
                'this_week' => array_slice($due, 0, 8),
                'late' => $late,
            ];
        }
    }

    Response::success([
        'today' => date('Y-m-d'),
        'agenda' => $agenda,
        'week_review' => $weekReview,
        'exclusivities' => $exclusivities,
        'months' => $months,
        'tasks' => $tasks,
        'snoozed' => $snoozed,
        'done_today' => $doneToday,
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
        'ai' => ['enabled' => AiClient::provider() !== null, 'provider' => AiClient::provider(), 'documents' => AiClient::key('claude') !== ''],
        'social' => $social,
        'social_stale' => $socialStale,
        'urgent_returns_count' => $urgentReturnsCount,
        'urgent_purchases' => $urgentPurchases,
        'unpaid_collaborations' => $unpaidCollabs,
        'next_idea' => $nextIdea,
        'draft_ideas' => $draftIdeas,
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
