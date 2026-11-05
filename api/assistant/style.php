<?php
/**
 * "Asystent" - what she told it about her writing style.
 * GET  /api/assistant/style.php              -> { notes: ["nie używam słowa stylówka", ...] }
 * POST /api/assistant/style.php { remove: "..." } -> forget one note ("Cofnij" after it was saved)
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../utils/WritingStyle.php';
require_once __DIR__ . '/../middleware/auth.php';

try {
    $userId = (int) getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $remove = (string) ($input['remove'] ?? '');
        $notes = styleNotes($conn, $userId);
        $index = array_search($remove, array_reverse($notes, true), true);
        if ($index !== false) {
            unset($notes[$index]);
            saveStyleNotes($conn, $userId, $notes);
        }
        Response::success(['notes' => array_values($notes)]);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        Response::error('Method not allowed', 405);
    }
    Response::success(['notes' => styleNotes($conn, $userId)]);
} catch (Exception $e) {
    Response::error('Nie udało się wczytać stylu', 500);
}
