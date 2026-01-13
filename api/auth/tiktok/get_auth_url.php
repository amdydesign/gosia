<?php
/**
 * TikTok OAuth - Get Auth URL
 * GET /api/auth/tiktok/get_auth_url.php
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Response.php';

// Load credentials
$credsPath = __DIR__ . '/../../config/social_credentials.php';
if (!file_exists($credsPath)) {
    Response::error('Brak konfiguracji API', 500);
}
$creds = require $credsPath;
$tiktok = $creds['tiktok'] ?? null;

if (!$tiktok || empty($tiktok['client_key'])) {
    Response::error('Skonfiguruj TikTok w api/config/social_credentials.php', 500);
}

// TikTok OAuth 2.0 Authorization URL
// https://developers.tiktok.com/doc/login-kit-web/
$csrfState = bin2hex(random_bytes(16));

$params = [
    'client_key' => $tiktok['client_key'],
    'scope' => 'user.info.basic,user.info.stats',
    'response_type' => 'code',
    'redirect_uri' => $tiktok['redirect_uri'],
    'state' => $csrfState
];

$url = 'https://www.tiktok.com/v2/auth/authorize/?' . http_build_query($params);

Response::success(['url' => $url, 'state' => $csrfState]);
