<?php
/**
 * Face ID keys of the logged-in account.
 *
 * GET    /api/auth/passkey/index.php          -> [{ id, name, created_at, last_used_at }]
 * DELETE /api/auth/passkey/index.php?id=3     -> removes one (that device logs in with the password again)
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../config/Schema.php';
require_once __DIR__ . '/../../middleware/auth.php';

try {
    $userId = (int) getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'passkeys');

    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $conn->prepare("DELETE FROM passkeys WHERE id = :id AND user_id = :user_id")
            ->execute(['id' => (int) ($_GET['id'] ?? 0), 'user_id' => $userId]);
        Response::success(['message' => 'Usunięte']);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        Response::error('Method not allowed', 405);
    }
    $stmt = $conn->prepare("SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = :user_id ORDER BY created_at DESC");
    $stmt->execute(['user_id' => $userId]);
    Response::success($stmt->fetchAll(PDO::FETCH_ASSOC));
} catch (Exception $e) {
    Response::error('Nie udało się pobrać', 500);
}
