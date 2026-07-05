<?php
/**
 * Generate VAPID keys for Web Push
 * Run once from CLI:  php api/utils/generate_vapid_keys.php
 * Then copy the output into api/.env
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('CLI only');
}

require_once __DIR__ . '/../config/WebPush.php';

$keys = WebPush::generateVapidKeys();

echo "Add these lines to api/.env:\n\n";
echo "VAPID_PUBLIC_KEY=" . $keys['publicKey'] . "\n";
echo "VAPID_PRIVATE_KEY=" . $keys['privateKey'] . "\n";
echo "VAPID_SUBJECT=mailto:twoj-email@example.com\n";
