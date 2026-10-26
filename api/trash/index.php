<?php
/**
 * Kosz - things deleted in the last 30 days.
 *
 * GET  /api/trash/index.php            -> [{ id, entity_type, entity_id, title, deleted_at, days_left }]
 * POST /api/trash/index.php?restore=ID -> { type, id }  (puts it back - "Cofnij" / "Przywróć")
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../utils/Trash.php';

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $restored = Trash::restore($conn, $userId, intval($_GET['restore'] ?? 0));
        if (!$restored) {
            Response::notFound('Tego już nie ma w koszu');
        }
        Response::success($restored, 'Przywrócone');
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        Response::error('Method not allowed', 405);
    }
    Response::success(Trash::items($conn, $userId));
} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Trash failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się', 500);
}
