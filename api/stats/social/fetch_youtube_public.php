<?php
/**
 * Fetch YouTube Stats (Public API Key)
 * POST /api/stats/social/fetch_youtube_public.php
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
$apiKey = $creds['youtube']['api_key'] ?? null;

if (!$apiKey) {
    Response::error('Brak klucza API YouTube w konfiguracji', 500);
}

$input = json_decode(file_get_contents('php://input'), true);
$channelId = $input['channel_id'] ?? null;

if (!$channelId) {
    Response::error('Podaj ID kanału (np. UC...)', 400);
}

// Fetch from YouTube API
$url = "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id={$channelId}&key={$apiKey}";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = json_decode($response, true);

if ($httpCode !== 200) {
    Response::error('Błąd API YouTube: ' . ($data['error']['message'] ?? 'Nieznany błąd'), 400);
}

if (empty($data['items'])) {
    Response::error('Nie znaleziono kanału o podanym ID.', 404);
}

$item = $data['items'][0];
$title = $item['snippet']['title'];
$subscriberCount = $item['statistics']['subscriberCount'];

// Save to DB
try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();

    // 1. Update/Insert Connection (without tokens)
    // We use NULL for tokens as we use Public API Key
    $stmt = $conn->prepare("
        INSERT INTO social_connections (user_id, provider, provider_user_id, access_token, expires_at)
        VALUES (:uid, 'youtube', :puid, NULL, NULL)
        ON DUPLICATE KEY UPDATE 
        provider_user_id = VALUES(provider_user_id),
        access_token = NULL -- Reset token if we switched from OAuth to Key
    ");
    $stmt->execute(['uid' => $userId, 'puid' => $channelId]);

    // 2. Update Stats
    $date = date('Y-m-d');
    $statsStmt = $conn->prepare("
        INSERT INTO social_stats (user_id, platform, followers_count, date)
        VALUES (:uid, 'youtube', :count, :date)
        ON DUPLICATE KEY UPDATE followers_count = :count_update
    ");
    $statsStmt->execute([
        'uid' => $userId,
        'count' => $subscriberCount,
        'date' => $date,
        'count_update' => $subscriberCount
    ]);

    Response::success([
        'platform' => 'youtube',
        'count' => (int) $subscriberCount,
        'channel' => $title,
        'message' => "Połączono z kanałem $title"
    ]);

} catch (Exception $e) {
    Response::error('Błąd bazy danych: ' . $e->getMessage(), 500);
}
