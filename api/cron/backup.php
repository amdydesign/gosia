<?php
/**
 * Backup now (normally the 15-minute reminders cron does it once a night - see api/utils/Backup.php).
 *
 *   php api/cron/backup.php           database only
 *   php api/cron/backup.php --files   database + uploaded files
 *   URL: /api/cron/backup.php?secret=CRON_SECRET[&files=1]
 */

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../utils/Backup.php';

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

$withFiles = $isCli ? in_array('--files', $argv ?? [], true) : !empty($_GET['files']);
$db = new Database();
$report = Backup::run($db->getConnection(), $withFiles);

if ($isCli) {
    echo ($report['ok'] ? 'OK: ' . implode(', ', $report['files']) . ($report['remote'] ? ' (+ poza serwerem)' : '') : 'Błąd: ' . $report['error']) . "\n";
    exit($report['ok'] ? 0 : 1);
}
echo json_encode(['success' => $report['ok']] + $report, JSON_UNESCAPED_UNICODE);
