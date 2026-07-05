<?php
/**
 * VAPID Public Key
 * GET /api/push/public_key.php
 * Returns the key the browser needs for pushManager.subscribe()
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/WebPush.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

requireAuth();

if (!WebPush::isConfigured()) {
    Response::error('Push notifications are not configured on the server', 503);
}

Response::success(['publicKey' => WebPush::getPublicKey()]);
