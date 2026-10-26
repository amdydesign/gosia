<?php
/**
 * The personal key of the iPhone share-sheet Shortcut ("Udostępnij -> Gonia").
 *
 * GET  /api/inbox/token.php  -> { token, url }   (made on first use)
 * POST /api/inbox/token.php  -> a new key (the old Shortcut stops working)
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Mailer.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

try {
    $userId = (int) getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();
    $token = inboxToken($conn, $userId, $_SERVER['REQUEST_METHOD'] === 'POST');
    Response::success(['token' => $token, 'url' => Mailer::appUrl() . '/api/inbox/upload.php']);
} catch (Exception $e) {
    Response::error('Nie udało się', 500);
}
