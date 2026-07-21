<?php
/**
 * VAPID Public Key
 * GET /api/push/public_key.php
 * Returns the key the browser needs for pushManager.subscribe()
 */

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../config/WebPush.php';
requireMethod('GET');

requireAuth();

if (!WebPush::isConfigured()) {
    Response::error('Push notifications are not configured on the server', 503);
}

Response::success(['publicKey' => WebPush::getPublicKey()]);
