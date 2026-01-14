<?php
/**
 * Facebook OAuth - Get Auth URL
 * GET /api/auth/facebook/get_auth_url.php
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Response.php';

$credsPath = __DIR__ . '/../../config/social_credentials.php';
if (!file_exists($credsPath)) {
    Response::error('Brak konfiguracji API', 500);
}
$creds = require $credsPath;
$fb = $creds['facebook'] ?? null;

if (!$fb || empty($fb['app_id'])) {
    Response::error('Skonfiguruj Facebook w api/config/social_credentials.php', 500);
}

// Facebook OAuth URL
// https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
$params = [
    'client_id' => $fb['app_id'],
    'redirect_uri' => $fb['redirect_uri'],
    'scope' => 'public_profile',
    'response_type' => 'code',
    'state' => bin2hex(random_bytes(16))
];

$url = 'https://www.facebook.com/v18.0/dialog/oauth?' . http_build_query($params);

Response::success(['url' => $url]);
