<?php
/**
 * Refresh Social Stats from APIs
 * POST /api/stats/social/refresh.php
 * 
 * Automatically fetches fresh data from all connected platforms.
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
    Response::error('Brak konfiguracji API', 500);
}
$creds = require $credsPath;

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();

    $refreshed = [];
    $errors = [];

    // Get connected platforms
    $stmt = $conn->prepare("SELECT provider, provider_user_id, access_token FROM social_connections WHERE user_id = :uid");
    $stmt->execute(['uid' => $userId]);
    $connections = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($connections as $connection) {
        $platform = $connection['provider'];
        $providerId = $connection['provider_user_id'];

        try {
            $count = null;

            // YouTube - use API Key
            if ($platform === 'youtube' && $providerId) {
                $apiKey = $creds['youtube']['api_key'] ?? null;
                if ($apiKey) {
                    $url = "https://www.googleapis.com/youtube/v3/channels?part=statistics&id={$providerId}&key={$apiKey}";
                    $ch = curl_init();
                    curl_setopt($ch, CURLOPT_URL, $url);
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
                    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
                    $response = curl_exec($ch);
                    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                    curl_close($ch);

                    if ($httpCode === 200) {
                        $data = json_decode($response, true);
                        if (!empty($data['items'][0]['statistics']['subscriberCount'])) {
                            $count = (int) $data['items'][0]['statistics']['subscriberCount'];
                        }
                    }
                }
            }

            // Facebook - use access token to get page likes
            if ($platform === 'facebook' && $connection['access_token']) {
                $accessToken = $connection['access_token'];
                // Get user's pages and their likes
                $url = "https://graph.facebook.com/v18.0/me/accounts?fields=fan_count&access_token={$accessToken}";
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
                curl_setopt($ch, CURLOPT_TIMEOUT, 10);
                $response = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                if ($httpCode === 200) {
                    $data = json_decode($response, true);
                    if (!empty($data['data'])) {
                        // Sum all page fans or take first page
                        $count = 0;
                        foreach ($data['data'] as $page) {
                            $count += (int) ($page['fan_count'] ?? 0);
                        }
                    }
                }
            }

            // TikTok - use access token
            if ($platform === 'tiktok' && $connection['access_token']) {
                $accessToken = $connection['access_token'];
                $url = "https://open.tiktokapis.com/v2/user/info/?fields=follower_count";
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
                curl_setopt($ch, CURLOPT_TIMEOUT, 10);
                curl_setopt($ch, CURLOPT_HTTPHEADER, [
                    "Authorization: Bearer {$accessToken}"
                ]);
                $response = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                if ($httpCode === 200) {
                    $data = json_decode($response, true);
                    if (!empty($data['data']['user']['follower_count'])) {
                        $count = (int) $data['data']['user']['follower_count'];
                    }
                }
            }

            // Save to DB if we got a count
            if ($count !== null) {
                $date = date('Y-m-d');
                $statsStmt = $conn->prepare("
                    INSERT INTO social_stats (user_id, platform, followers_count, date)
                    VALUES (:uid, :platform, :count, :date)
                    ON DUPLICATE KEY UPDATE followers_count = :count_update
                ");
                $statsStmt->execute([
                    'uid' => $userId,
                    'platform' => $platform,
                    'count' => $count,
                    'date' => $date,
                    'count_update' => $count
                ]);
                $refreshed[$platform] = $count;
            }

        } catch (Exception $e) {
            $errors[$platform] = $e->getMessage();
        }
    }

    Response::success([
        'refreshed' => $refreshed,
        'errors' => $errors,
        'message' => count($refreshed) > 0 ? 'Statystyki zostały odświeżone' : 'Brak platform do odświeżenia'
    ]);

} catch (Exception $e) {
    Response::error('Błąd: ' . $e->getMessage(), 500);
}
