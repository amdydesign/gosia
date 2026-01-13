<?php
/**
 * Check Connection Status
 * GET /api/stats/social/status.php
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();

    $stmt = $conn->prepare("SELECT provider, created_at FROM social_connections WHERE user_id = :uid");
    $stmt->execute(['uid' => $userId]);
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $connected = [];
    foreach ($results as $row) {
        $connected[$row['provider']] = true;
    }

    $platforms = ['facebook', 'instagram', 'tiktok', 'youtube'];
    $status = [];
    foreach ($platforms as $p) {
        $status[$p] = isset($connected[$p]);
    }

    Response::success($status);

} catch (Exception $e) {
    Response::error('Error', 500);
}
