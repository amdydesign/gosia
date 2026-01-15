<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/Database.php';
$credentials = require __DIR__ . '/../config/social_credentials.php';

// Check if RapidAPI key is configured
if (empty($credentials['rapidapi']['key']) || $credentials['rapidapi']['key'] === 'YOUR_RAPIDAPI_KEY') {
    echo json_encode(['success' => false, 'error' => 'Brak klucza RapidAPI na serwerze (zaktualizuj social_credentials.php).']);
    exit;
}

$apiKey = $credentials['rapidapi']['key'];
$apiHost = $credentials['rapidapi']['host'];
$username = $credentials['rapidapi']['username'];

// 1. Initialize CURL
$curl = curl_init();

curl_setopt_array($curl, [
    CURLOPT_URL => "https://{$apiHost}/web-profile?username=" . urlencode($username),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_ENCODING => "",
    CURLOPT_MAXREDIRS => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    CURLOPT_CUSTOMREQUEST => "GET",
    CURLOPT_HTTPHEADER => [
        "x-rapidapi-host: {$apiHost}",
        "x-rapidapi-key: {$apiKey}"
    ],
]);

$response = curl_exec($curl);
$err = curl_error($curl);
$httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);

curl_close($curl);

if ($err) {
    echo json_encode(['success' => false, 'error' => "cURL Error: " . $err]);
    exit;
}

if ($httpCode === 429) {
    echo json_encode(['success' => false, 'error' => "Limit zapytań RapidAPI (Instagram) został wyczerpany. Spróbuj jutro lub zmień plan."]);
    exit;
}

// 2. Parse Response
$data = json_decode($response, true);

// Debug logging (optional, can be removed)
// file_put_contents(__DIR__ . '/debug_response.json', $response);

$followers = 0;

// Parsing logic for different API structures (including fb_profile_hover)
if (isset($data['user_data']['follower_count'])) {
    $followers = $data['user_data']['follower_count'];
} elseif (isset($data['edge_followed_by']['count'])) {
    $followers = $data['edge_followed_by']['count'];
} elseif (isset($data['data']['user']['edge_followed_by']['count'])) {
    $followers = $data['data']['user']['edge_followed_by']['count'];
} elseif (isset($data['follower_count'])) {
    $followers = $data['follower_count'];
} elseif (isset($data['graphql']['user']['edge_followed_by']['count'])) {
    $followers = $data['graphql']['user']['edge_followed_by']['count'];
}

// Fallback search in array if structure is complex
if ($followers == 0) {
    array_walk_recursive($data, function ($item, $key) use (&$followers) {
        if (($key === 'edge_followed_by' || $key === 'follower_count') && is_array($item) && isset($item['count'])) {
            $followers = $item['count'];
        } elseif ($key === 'follower_count' && is_numeric($item)) {
            $followers = $item;
        }
    });
}

// 3. Save to Database
try {
    $db = new Database();
    $conn = $db->getConnection();

    $userId = 1; // Default Admin User for now
    $platform = 'instagram';
    $date = date('Y-m-d');

    $sql = "INSERT INTO social_stats (user_id, platform, followers_count, date) 
            VALUES (:user_id, :platform, :count, :date)
            ON DUPLICATE KEY UPDATE followers_count = :count_update";

    $stmt = $conn->prepare($sql);
    $stmt->bindParam(':user_id', $userId);
    $stmt->bindParam(':platform', $platform);
    $stmt->bindParam(':count', $followers);
    $stmt->bindParam(':date', $date);
    $stmt->bindParam(':count_update', $followers);

    if ($stmt->execute()) {
        echo json_encode([
            'success' => true,
            'message' => 'Zaktualizowano Instagram',
            'followers' => $followers,
            'platform' => 'instagram'
        ]);
    } else {
        throw new Exception("Błąd zapisu do bazy.");
    }

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
