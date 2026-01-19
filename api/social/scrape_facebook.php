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

// Instantiate Database to load .env
$db = new Database();

$credentials = require __DIR__ . '/../config/social_credentials.php';

// Check if Facebook RapidAPI key is configured
if (empty($credentials['facebook_rapidapi']['key'])) {
    echo json_encode(['success' => false, 'error' => 'Brak klucza Facebook RapidAPI na serwerze (zaktualizuj social_credentials.php).']);
    exit;
}

$apiKey = $credentials['facebook_rapidapi']['key'];
$apiHost = $credentials['facebook_rapidapi']['host'];
$targetUrl = $credentials['facebook_rapidapi']['url'];

// 1. Initialize CURL
$curl = curl_init();

$params = [
    'link' => $targetUrl,
    'exact_followers_count' => 'true',
    'show_verified_badge' => 'false',
    'proxy_country' => 'us',
    'page_section' => 'default'
];
$query = http_build_query($params);
$requestUrl = "https://{$apiHost}/get_facebook_pages_details_from_link?" . $query;

curl_setopt_array($curl, [
    CURLOPT_URL => $requestUrl,
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

curl_close($curl);

if ($err) {
    echo json_encode(['success' => false, 'error' => "cURL Error: " . $err]);
    exit;
}

// 2. Parse Response
$data = json_decode($response, true);
$followers = 0;

if (isset($data['body']['followers_count'])) {
    $followers = $data['body']['followers_count'];
} elseif (isset($data['followers_count'])) {
    $followers = $data['followers_count'];
}

// Fallback search
if ($followers == 0) {
    array_walk_recursive($data, function ($item, $key) use (&$followers) {
        if (($key === 'followers_count') && is_numeric($item) && $item > 0) {
            $followers = $item;
        }
    });
}

// 3. Save to Database
try {
    // Database already instantiated at top of file
    $conn = $db->getConnection();

    $userId = 1;
    $platform = 'facebook';
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
            'message' => 'Zaktualizowano Facebook',
            'followers' => $followers,
            'platform' => 'facebook'
        ]);
    } else {
        throw new Exception("Błąd zapisu do bazy.");
    }

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
