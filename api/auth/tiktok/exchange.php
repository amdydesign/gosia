<?php
/**
 * TikTok OAuth - Exchange Code for Token
 * POST /api/auth/tiktok/exchange.php
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

// Load credentials
$credsPath = __DIR__ . '/../../config/social_credentials.php';
if (!file_exists($credsPath)) {
    Response::error('Brak konfiguracji', 500);
}
$creds = require $credsPath;
$tiktok = $creds['tiktok'] ?? null;

if (!$tiktok) {
    Response::error('Brak konfiguracji TikTok', 500);
}

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true);
    $code = $input['code'] ?? null;

    if (!$code) {
        Response::error('Brak kodu autoryzacji', 400);
    }

    // Exchange code for access token
    // https://developers.tiktok.com/doc/oauth-user-access-token-management/
    $tokenUrl = 'https://open.tiktokapis.com/v2/oauth/token/';

    $postData = [
        'client_key' => $tiktok['client_key'],
        'client_secret' => $tiktok['client_secret'],
        'code' => $code,
        'grant_type' => 'authorization_code',
        'redirect_uri' => $tiktok['redirect_uri']
    ];

    $ch = curl_init($tokenUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/x-www-form-urlencoded'
    ]);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $tokenData = json_decode($response, true);

    if ($httpCode !== 200 || isset($tokenData['error'])) {
        Response::error('Token exchange failed: ' . ($tokenData['error_description'] ?? $tokenData['error'] ?? 'Unknown'), 400);
    }

    $accessToken = $tokenData['access_token'];
    $openId = $tokenData['open_id'];
    $expiresIn = $tokenData['expires_in'];
    $refreshToken = $tokenData['refresh_token'] ?? null;
    $expiresAt = date('Y-m-d H:i:s', time() + $expiresIn);

    // Fetch user info (including follower count)
    // https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/
    $userInfoUrl = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count';

    $ch = curl_init($userInfoUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $accessToken"
    ]);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $userResponse = curl_exec($ch);
    curl_close($ch);

    $userData = json_decode($userResponse, true);

    if (empty($userData['data']['user'])) {
        Response::error('Nie udało się pobrać danych użytkownika TikTok', 400);
    }

    $user = $userData['data']['user'];
    $displayName = $user['display_name'] ?? 'TikTok User';
    $followerCount = $user['follower_count'] ?? 0;

    // Save to DB
    $db = new Database();
    $conn = $db->getConnection();

    // Save connection
    $stmt = $conn->prepare("
        INSERT INTO social_connections (user_id, provider, provider_user_id, access_token, refresh_token, expires_at)
        VALUES (:uid, 'tiktok', :puid, :at, :rt, :exp)
        ON DUPLICATE KEY UPDATE 
        provider_user_id = VALUES(provider_user_id),
        access_token = VALUES(access_token),
        refresh_token = VALUES(refresh_token),
        expires_at = VALUES(expires_at)
    ");
    $stmt->execute([
        'uid' => $userId,
        'puid' => $openId,
        'at' => $accessToken,
        'rt' => $refreshToken,
        'exp' => $expiresAt
    ]);

    // Save stats
    $date = date('Y-m-d');
    $statsStmt = $conn->prepare("
        INSERT INTO social_stats (user_id, platform, followers_count, date)
        VALUES (:uid, 'tiktok', :count, :date)
        ON DUPLICATE KEY UPDATE followers_count = :count_update
    ");
    $statsStmt->execute([
        'uid' => $userId,
        'count' => $followerCount,
        'date' => $date,
        'count_update' => $followerCount
    ]);

    Response::success([
        'platform' => 'tiktok',
        'count' => (int) $followerCount,
        'username' => $displayName,
        'message' => "Połączono z TikTok jako @$displayName"
    ]);

} catch (Exception $e) {
    Response::error('Błąd: ' . $e->getMessage(), 500);
}
