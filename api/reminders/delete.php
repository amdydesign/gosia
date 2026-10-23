<?php
/**
 * Cancel a pending reminder (Cofnij after "Później")
 * DELETE /api/reminders/delete.php?ref_key=return:zalando
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $refKey = trim((string) ($_GET['ref_key'] ?? ''));

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'reminders');

    $stmt = $conn->prepare("DELETE FROM reminders WHERE user_id = :user_id AND ref_key = :ref_key AND sent_at IS NULL");
    $stmt->execute(['user_id' => $userId, 'ref_key' => $refKey]);

    Response::success(['deleted' => $stmt->rowCount()]);

} catch (Exception $e) {
    Response::error('Nie udało się anulować przypomnienia', 500);
}
