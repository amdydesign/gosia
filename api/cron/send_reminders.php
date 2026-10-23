<?php
/**
 * Push reminders (cron, every 15 minutes).
 *
 * Per user with notifications on, in Polish local time, never during quiet hours
 * (anything due then waits until they end):
 *  - snoozed things ("Przypomnij jutro 9:00") exactly when they are due,
 *  - "Na dziś" summary once a day at the chosen time (same list as Start),
 *  - return deadlines at midday: last day and the day before (and 3 days before
 *    when the summary is off),
 *  - overdue payments once a week,
 *  - ideas to record on Mondays and Thursdays.
 * Every message is logged in push_log, so running often never repeats one.
 * Messages carry no amounts - the lock screen can be seen by others.
 *
 * dHosting (cron co 15 minut):
 *   CLI:  php /path/to/public_html/api/cron/send_reminders.php
 *   URL:  https://domena.pl/api/cron/send_reminders.php?secret=CRON_SECRET
 * Add ?dry=1 (or --dry) to see what would be sent without sending anything.
 */

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/WebPush.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/PushPrefs.php';
require_once __DIR__ . '/../utils/TodayAgenda.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->safeLoad();

$isCli = php_sapi_name() === 'cli';

if (!$isCli) {
    header('Content-Type: application/json; charset=utf-8');
    $secret = $_ENV['CRON_SECRET'] ?? '';
    if ($secret === '' || !hash_equals($secret, $_GET['secret'] ?? '')) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Forbidden']);
        exit;
    }
}

$dry = $isCli ? in_array('--dry', $argv ?? [], true) : !empty($_GET['dry']);
const RETURNS_TIME = '12:00';

if (!$dry && !WebPush::isConfigured()) {
    $msg = 'VAPID keys not configured - nothing to send';
    echo $isCli ? $msg . "\n" : json_encode(['success' => false, 'message' => $msg]);
    exit;
}

try {
    $db = new Database();
    $conn = $db->getConnection();
    foreach (['push_subscriptions', 'push_log', 'reminders', 'app_settings'] as $table) {
        Schema::ensure($conn, $table);
    }
    $webPush = $dry ? null : new WebPush();
    $now = new DateTime();
    $time = $now->format('H:i');
    $today = $now->format('Y-m-d');
    $report = [];

    $userIds = $conn->query("SELECT DISTINCT user_id FROM push_subscriptions")->fetchAll(PDO::FETCH_COLUMN);

    foreach ($userIds as $userId) {
        $userId = (int) $userId;
        $prefs = PushPrefs::load($conn, $userId);
        if (PushPrefs::isQuiet($prefs, $now)) {
            continue;
        }

        $send = function (array $payload, $dedupKey) use ($conn, $userId, $webPush, $dry, &$report) {
            if ($dedupKey !== null) {
                $stmt = $conn->prepare("SELECT 1 FROM push_log WHERE user_id = :user_id AND dedup_key = :k");
                $stmt->execute(['user_id' => $userId, 'k' => $dedupKey]);
                if ($stmt->fetchColumn()) {
                    return;
                }
            }
            $delivered = $dry ? 0 : $webPush->sendToUser($conn, $userId, $payload);
            $report[] = ['user' => $userId, 'key' => $dedupKey, 'title' => $payload['title'], 'body' => $payload['body'] ?? '', 'delivered' => $delivered];
            if ($dedupKey !== null && !$dry) {
                $conn->prepare("INSERT IGNORE INTO push_log (user_id, dedup_key, sent_at) VALUES (:user_id, :k, :at)")
                    ->execute(['user_id' => $userId, 'k' => $dedupKey, 'at' => date('Y-m-d H:i:s')]);
            }
        };

        // 1. Snoozed things that are due now
        $stmt = $conn->prepare("SELECT id, title, url FROM reminders WHERE user_id = :user_id AND sent_at IS NULL AND remind_at <= :now ORDER BY remind_at");
        $stmt->execute(['user_id' => $userId, 'now' => $now->format('Y-m-d H:i:s')]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $send(['title' => 'Przypominam', 'body' => $r['title'], 'url' => $r['url'], 'tag' => 'reminder-' . $r['id']], null);
            if (!$dry) {
                $conn->prepare("UPDATE reminders SET sent_at = :at WHERE id = :id")->execute(['at' => date('Y-m-d H:i:s'), 'id' => $r['id']]);
            }
        }

        $agenda = null;
        $getAgenda = function () use (&$agenda, $conn, $userId) {
            if ($agenda === null) {
                $agenda = TodayAgenda::build($conn, $userId);
            }
            return $agenda;
        };

        // 2. "Na dziś"
        if ($prefs['summary'] && $time >= $prefs['summary_time']) {
            $todayItems = array_values(array_filter($getAgenda(), function ($i) {
                return $i['bucket'] === 'today' || $i['bucket'] === 'later';
            }));
            $n = count($todayItems);
            if ($n > 0) {
                $first = $todayItems[0];
                $body = 'Najpierw: ' . $first['title'] . whenText($first) . '.';
                $rest = array_map(function ($i) {
                    return $i['title'];
                }, array_slice($todayItems, 1, 2));
                if ($rest) {
                    $body .= ' Potem: ' . implode(', ', $rest) . ($n > 3 ? ' i ' . ($n - 3) . ' więcej' : '') . '.';
                }
                $send([
                    'title' => 'Na dziś: ' . $n . ' ' . TodayAgenda::plural($n, 'sprawa', 'sprawy', 'spraw'),
                    'body' => $body,
                    'url' => '/dashboard',
                    'tag' => 'summary',
                    'badge' => $n,
                ], 'summary:' . $today);
            } elseif (!$dry) {
                // nothing to do - still mark the day so the list is not rebuilt every 15 minutes
                $conn->prepare("INSERT IGNORE INTO push_log (user_id, dedup_key, sent_at) VALUES (:user_id, :k, :at)")
                    ->execute(['user_id' => $userId, 'k' => 'summary:' . $today, 'at' => date('Y-m-d H:i:s')]);
            }
        }

        // 3. Return deadlines (midday nudge, only while the parcel is still undecided)
        if ($prefs['returns'] && $time >= RETURNS_TIME) {
            $days = $prefs['summary'] ? [0, 1] : [0, 1, 3];
            foreach ($getAgenda() as $item) {
                // snoozed returns get their own reminder at the chosen time
                if ($item['kind'] !== 'return' || !in_array($item['days'], $days, true) || !empty($item['snoozed_until'])) {
                    continue;
                }
                $title = $item['days'] === 0 ? 'Dziś ostatni dzień zwrotu' : ($item['days'] === 1 ? 'Jutro mija termin zwrotu' : 'Za 3 dni mija termin zwrotu');
                $send([
                    'title' => $title,
                    'body' => $item['store'] . ' — ' . $item['meta'] . '. Zrobione? Odhacz w Goni.',
                    'url' => '/purchases',
                    'tag' => $item['ref_key'],
                ], $item['ref_key'] . ':' . $item['deadline'] . ':' . $item['days']);
            }
        }

        // 4. Overdue payments - once a week
        if ($prefs['payments'] && $time >= $prefs['summary_time']) {
            $late = array_values(array_filter($getAgenda(), function ($i) {
                return $i['kind'] === 'payment' && empty($i['snoozed_until']);
            }));
            if ($late) {
                $brands = array_map(function ($i) {
                    return $i['brand'];
                }, array_slice($late, 0, 3));
                $n = count($late);
                $send([
                    'title' => 'Zaległe płatności: ' . $n,
                    'body' => implode(', ', $brands) . ($n > 3 ? ' i inne' : '') . ' — warto napisać przypomnienie.',
                    'url' => '/collaborations',
                    'tag' => 'payments',
                ], 'payments:' . $now->format('o-\WW'));
            }
        }

        // 5. Ideas to record - Monday and Thursday (any draft with a script, planned or not)
        if ($prefs['ideas'] && in_array((int) $now->format('N'), [1, 4], true) && $time >= $prefs['ideas_time']) {
            $stmt = $conn->prepare("
                SELECT id, title FROM ideas
                WHERE user_id = :user_id AND status = 'draft' AND content IS NOT NULL AND content <> ''
                ORDER BY created_at DESC
            ");
            $stmt->execute(['user_id' => $userId]);
            $drafts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if ($drafts) {
                $n = count($drafts);
                $send([
                    'title' => 'Dobry moment na nagranie',
                    'body' => $n === 1
                        ? '„' . $drafts[0]['title'] . '” czeka na prompter.'
                        : 'Masz ' . $n . ' ' . TodayAgenda::plural($n, 'pomysł', 'pomysły', 'pomysłów') . ' do nagrania, np. „' . $drafts[0]['title'] . '”.',
                    'url' => $n === 1 ? '/ideas/' . $drafts[0]['id'] . '?prompter=1' : '/ideas',
                    'tag' => 'ideas',
                ], 'ideas:' . $today);
            }
        }
    }

    // Housekeeping
    if (!$dry && $now->format('H:i') < '00:15') {
        $conn->exec("DELETE FROM push_log WHERE sent_at < DATE_SUB(NOW(), INTERVAL 60 DAY)");
        $conn->exec("DELETE FROM reminders WHERE sent_at IS NOT NULL AND sent_at < DATE_SUB(NOW(), INTERVAL 30 DAY)");
    }

    $summary = ['success' => true, 'dry' => $dry, 'time' => $now->format('Y-m-d H:i'), 'users' => count($userIds), 'messages' => $report];
    if ($isCli) {
        echo ($dry ? '[dry] ' : '') . 'Done ' . $summary['time'] . '. Users: ' . count($userIds) . ', messages: ' . count($report) . "\n";
        foreach ($report as $r) {
            echo " - u{$r['user']} {$r['title']}: {$r['body']} (delivered {$r['delivered']})\n";
        }
    } else {
        echo json_encode($summary, JSON_UNESCAPED_UNICODE);
    }

} catch (Exception $e) {
    if ($isCli) {
        fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n");
        exit(1);
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Cron failed']);
}

function whenText(array $item)
{
    if ($item['kind'] === 'return') {
        return $item['days'] === 0 ? ' (ostatni dzień)' : ($item['days'] === 1 ? ' (termin jutro)' : ' (za ' . $item['days'] . ' dni)');
    }
    if ($item['kind'] === 'task' && $item['late']) {
        return ' (po terminie)';
    }
    return '';
}
