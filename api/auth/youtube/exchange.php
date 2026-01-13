<?php
/**
 * YouTube OAuth Callback Exchange
 * POST /api/auth/youtube/exchange.php
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
    Response::error('Server configuration error', 500);
}
$creds = require $credsPath;
$youtube = $creds['youtube'] ?? null;

try {
    $userId = getCurrentUserId(); // Authenticated via JWT
    $input = json_decode(file_get_contents('php://input'), true);
    $code = $input['code'] ?? null;

    if (!$code) {
        Response::error('No code provided', 400);
    }

    // Exchange code for tokens
    $tokenUrl = 'https://oauth2.googleapis.com/token';
    $postData = [
        'code' => $code,
        'client_id' => $youtube['client_id'],
        'client_secret' => $youtube['client_secret'],
        'redirect_uri' => $youtube['redirect_uri'],
        'grant_type' => 'authorization_code'
    ];

    $ch = curl_init($tokenUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $tokenData = json_decode($response, true);

    if ($httpCode !== 200 || isset($tokenData['error'])) {
        Response::error('Failed to exchange token: ' . ($tokenData['error_description'] ?? $tokenData['error'] ?? 'Unknown error'), 400);
    }

    $accessToken = $tokenData['access_token'];
    $refreshToken = $tokenData['refresh_token'] ?? null; // Only returned on first consent or forced prompt
    $expiresIn = $tokenData['expires_in'];
    $expiresAt = date('Y-m-d H:i:s', time() + $expiresIn);

    // Get Channel Info (to confirm identity and get followers)
    $userInfoUrl = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true';
    $ch = curl_init($userInfoUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $accessToken"]);
    $userResponse = curl_exec($ch);
    curl_close($ch);

    $userData = json_decode($userResponse, true);
    if (empty($userData['items'])) {
        Response::error('Could not fetch YouTube channel info', 400);
    }

    $channel = $userData['items'][0];
    $providerUserId = $channel['id'];
    $channelTitle = $channel['snippet']['title']; // Store this? Maybe in future.
    $followers = $channel['statistics']['subscriberCount'];

    // Database connection
    $db = new Database();
    $conn = $db->getConnection();

    // Store Connection
    // If refresh token is missing (re-auth), keep old one if exists? 
    // Usually Google only sends refresh_token if we asked for offline access AND it's the first time.
    // If we update, we should try to keep old refresh_token if new one is null.

    $sql = "INSERT INTO social_connections (user_id, provider, provider_user_id, access_token, refresh_token, expires_at)
            VALUES (:uid, 'youtube', :puid, :at, :rt, :exp)
            ON DUPLICATE KEY UPDATE 
            provider_user_id = VALUES(provider_user_id),
            access_token = VALUES(access_token),
            expires_at = VALUES(expires_at)";

    if ($refreshToken) {
        $sql .= ", refresh_token = VALUES(refresh_token)";
    }

    $stmt = $conn->prepare($sql);
    $params = [
        'uid' => $userId,
        'puid' => $providerUserId,
        'at' => $accessToken,
        'rt' => $refreshToken, // Might be null, but we handled SQL conditionally above? 
        // Actually PDO parameters binding doesn't work with conditional SQL string easily if param is missing.
        // Simpler: Just update it if it's not null.
        'exp' => $expiresAt
    ];

    // Let's rewrite query safely
    if ($refreshToken) {
        // We have new refresh token, update everything
        $stmt = $conn->prepare("INSERT INTO social_connections (user_id, provider, provider_user_id, access_token, refresh_token, expires_at)
            VALUES (:uid, 'youtube', :puid, :at, :rt, :exp)
            ON DUPLICATE KEY UPDATE 
            provider_user_id = VALUES(provider_user_id),
            access_token = VALUES(access_token),
            refresh_token = VALUES(refresh_token),
            expires_at = VALUES(expires_at)");
    } else {
        // No new refresh token, keep old one (don't update that column)
        // But we must provide 'rt' for the INSERT part if it's a new row.
        // If it's a new row and no refresh token... that's bad (user re-authorized app that was deleted on our side but not revoked on Google?)
        // We prompt='consent' so we SHOULD get it.
        $stmt = $conn->prepare("INSERT INTO social_connections (user_id, provider, provider_user_id, access_token, refresh_token, expires_at)
            VALUES (:uid, 'youtube', :puid, :at, :rt, :exp)
            ON DUPLICATE KEY UPDATE 
            provider_user_id = VALUES(provider_user_id),
            access_token = VALUES(access_token),
            expires_at = VALUES(expires_at)");
    }

    $stmt->execute($params);

    // Also update statistics immediately!
    $count = intval($followers);
    $date = date('Y-m-d');

    $statsStmt = $conn->prepare("
        INSERT INTO social_stats (user_id, platform, followers_count, date)
        VALUES (:user_id, 'youtube', :count, :date)
        ON DUPLICATE KEY UPDATE followers_count = :count_update
    ");

    $statsStmt->execute([
        'user_id' => $userId,
        'count' => $count,
        'date' => $date,
        'count_update' => $count
    ]);

    Response::success(['message' => 'Connected to YouTube', 'channel' => $channelTitle]);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Exchange failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to connect YouTube', 500);
}
