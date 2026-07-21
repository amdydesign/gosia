<?php
/**
 * Check Connection Status
 * GET /api/stats/social/status.php
 */

require_once __DIR__ . '/../../bootstrap.php';
requireMethod('GET');

try {
    $userId = getCurrentUserId();
    $conn = db();

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
