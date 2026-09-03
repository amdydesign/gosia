<?php
/**
 * Daily social follower refresh (cron)
 *
 * Fetches follower counts for every user that has social profiles or OAuth
 * connections configured, and stores them in social_stats.
 *
 *   CLI cron:  php /path/to/public_html/api/cron/refresh_social.php
 *   URL cron:  https://domena.pl/api/cron/refresh_social.php?secret=CRON_SECRET
 * (the URL variant requires CRON_SECRET to be set in api/.env)
 *
 * Add ?force=1 to re-fetch even if today's numbers already exist.
 */

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/SocialFetcher.php';

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

@set_time_limit(300);
$force = $isCli ? in_array('--force', $argv ?? [], true) : !empty($_GET['force']);

try {
    $db = new Database();
    $conn = $db->getConnection();
    $fetcher = new SocialFetcher($conn);

    $users = $conn->query("SELECT id FROM users")->fetchAll(PDO::FETCH_COLUMN);
    $summary = [];
    foreach ($users as $userId) {
        $results = $fetcher->refreshUser($userId, null, $force);
        foreach ($results as $platform => $r) {
            if ($r['skipped']) {
                continue;
            }
            $summary[] = [
                'user_id' => (int) $userId,
                'platform' => $platform,
                'ok' => $r['ok'],
                'count' => $r['count'],
                'source' => $r['source'],
                'error' => $r['error'],
            ];
        }
    }

    if ($isCli) {
        foreach ($summary as $row) {
            echo sprintf("[user %d] %-9s %s %s\n", $row['user_id'], $row['platform'], $row['ok'] ? 'OK ' . $row['count'] . ' (' . $row['source'] . ')' : 'FAIL', $row['ok'] ? '' : $row['error']);
        }
        echo 'Done. ' . count($summary) . " platform(s) processed.\n";
    } else {
        echo json_encode(['success' => true, 'processed' => $summary], JSON_UNESCAPED_UNICODE);
    }

} catch (Exception $e) {
    if ($isCli) {
        fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n");
        exit(1);
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Cron failed']);
}
