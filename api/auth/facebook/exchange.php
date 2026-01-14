<?php
/**
 * Facebook OAuth - Exchange Code for Token
 * POST /api/auth/facebook/exchange.php
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$credsPath = __DIR__ . '/../../config/social_credentials.php';
if (!file_exists($credsPath)) {
    Response::error('Brak konfiguracji', 500);
}
$creds = require $credsPath;
$fb = $creds['facebook'] ?? null;

if (!$fb) {
    Response::error('Brak konfiguracji Facebook', 500);
}

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true);
    $code = $input['code'] ?? null;

    if (!$code) {
        Response::error('Brak kodu autoryzacji', 400);
    }

    // Exchange code for access token
    $tokenUrl = 'https://graph.facebook.com/v18.0/oauth/access_token';
    $params = [
        'client_id' => $fb['app_id'],
        'client_secret' => $fb['app_secret'],
        'redirect_uri' => $fb['redirect_uri'],
        'code' => $code
    ];

    $ch = curl_init($tokenUrl . '?' . http_build_query($params));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $response = curl_exec($ch);
    curl_close($ch);

    $tokenData = json_decode($response, true);

    if (isset($tokenData['error'])) {
        Response::error('Token error: ' . ($tokenData['error']['message'] ?? 'Unknown'), 400);
    }

    $accessToken = $tokenData['access_token'];

    // Get user info (name and ID)
    $userUrl = "https://graph.facebook.com/v18.0/me?fields=id,name&access_token=$accessToken";
    $ch = curl_init($userUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $userResponse = curl_exec($ch);
    curl_close($ch);

    $userData = json_decode($userResponse, true);
    $fbUserId = $userData['id'] ?? null;
    $fbName = $userData['name'] ?? 'Facebook User';

    if (!$fbUserId) {
        Response::error('Nie udało się pobrać danych użytkownika', 400);
    }

    // Get Facebook Page followers (if user has pages)
    // For personal profiles, we get friends_count (but requires special permissions)
    // Most common use case: Page followers
    $pagesUrl = "https://graph.facebook.com/v18.0/me/accounts?fields=id,name,followers_count&access_token=$accessToken";
    $ch = curl_init($pagesUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $pagesResponse = curl_exec($ch);
    curl_close($ch);

    $pagesData = json_decode($pagesResponse, true);

    $followerCount = 0;
    $pageName = $fbName;

    // Sum followers from all pages or take first page
    if (!empty($pagesData['data'])) {
        $firstPage = $pagesData['data'][0];
        $followerCount = $firstPage['followers_count'] ?? 0;
        $pageName = $firstPage['name'] ?? $fbName;
    }

    // Save to DB
    $db = new Database();
    $conn = $db->getConnection();

    $stmt = $conn->prepare("
        INSERT INTO social_connections (user_id, provider, provider_user_id, access_token, expires_at)
        VALUES (:uid, 'facebook', :puid, :at, NULL)
        ON DUPLICATE KEY UPDATE 
        provider_user_id = VALUES(provider_user_id),
        access_token = VALUES(access_token)
    ");
    $stmt->execute([
        'uid' => $userId,
        'puid' => $fbUserId,
        'at' => $accessToken
    ]);

    // Save stats
    $date = date('Y-m-d');
    $statsStmt = $conn->prepare("
        INSERT INTO social_stats (user_id, platform, followers_count, date)
        VALUES (:uid, 'facebook', :count, :date)
        ON DUPLICATE KEY UPDATE followers_count = :count_update
    ");
    $statsStmt->execute([
        'uid' => $userId,
        'count' => $followerCount,
        'date' => $date,
        'count_update' => $followerCount
    ]);

    Response::success([
        'platform' => 'facebook',
        'count' => (int) $followerCount,
        'page' => $pageName,
        'message' => "Połączono z Facebook ($pageName)"
    ]);

} catch (Exception $e) {
    Response::error('Błąd: ' . $e->getMessage(), 500);
}
