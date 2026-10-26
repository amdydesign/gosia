<?php
/**
 * "OK" on Start for things that are only good to know (end of exclusivity, licence) -
 * they leave the list for good. DELETE puts it back ("Cofnij").
 *
 * POST   /api/agenda/dismiss.php { ref_key, title }
 * DELETE /api/agenda/dismiss.php?ref_key=term:12:license:2026-11-30
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../utils/DoneLog.php';

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();

    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        DoneLog::forget($conn, $userId, (string) ($_GET['ref_key'] ?? ''));
        Response::success(null, 'Przywrócone');
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        Response::error('Method not allowed', 405);
    }
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $refKey = mb_substr(trim((string) ($input['ref_key'] ?? '')), 0, 120);
    // contract dates ("term:...") and the weekly review ("review:2026-W44")
    if (strpos($refKey, 'term:') !== 0 && strpos($refKey, 'review:') !== 0) {
        Response::validationError(['ref_key' => 'Tego nie da się odhaczyć']);
    }
    DoneLog::record($conn, $userId, $refKey, (string) ($input['title'] ?? ''));
    Response::success(null, 'OK');
} catch (Exception $e) {
    Response::error('Nie udało się zapisać', 500);
}
