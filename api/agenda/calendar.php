<?php
/**
 * "Kalendarz": what is coming, day by day (api/utils/CalendarEvents.php).
 *
 * GET /api/agenda/calendar.php?from=2026-10-26&to=2026-12-06 -> [{ date, time, kind, title, meta, amount, url, tone }]
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../utils/CalendarEvents.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $from = (string) ($_GET['from'] ?? '');
    $to = (string) ($_GET['to'] ?? '');
    $isDate = function ($d) {
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && strtotime($d);
    };
    if (!$isDate($from) || !$isDate($to) || $from > $to || (strtotime($to) - strtotime($from)) > 100 * 86400) {
        Response::validationError(['from' => 'Zły zakres dat']);
    }

    $db = new Database();
    Response::success(CalendarEvents::between($db->getConnection(), $userId, $from, $to));
} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Calendar failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się pobrać kalendarza', 500);
}
