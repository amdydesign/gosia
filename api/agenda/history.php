<?php
/**
 * "Historia" on Start: what got done, day by day (from done_log).
 *
 * GET /api/agenda/history.php?days=30 -> { items: [{ ref_key, title, done_at }], has_older }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../utils/DoneLog.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();

    $days = max(1, min(366, (int) ($_GET['days'] ?? 30)));
    Response::success(DoneLog::history($conn, $userId, $days));
} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('History failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się pobrać historii', 500);
}
