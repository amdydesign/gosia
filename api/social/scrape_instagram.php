<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST");

require_once __DIR__ . '/../config/Database.php';
$credentials = require __DIR__ . '/../config/social_credentials.php';

// Check if RapidAPI key is configured
if (empty($credentials['rapidapi']['key']) || $credentials['rapidapi']['key'] === 'YOUR_RAPIDAPI_KEY') {
    http_response_code(500);
    echo json_encode(['error' => 'Brak klucza RapidAPI w konfiguracji.']);
    exit;
}

$apiKey = $credentials['rapidapi']['key'];
$apiHost = $credentials['rapidapi']['host'];
$username = $credentials['rapidapi']['username'];

// 1. Initialize CURL
$curl = curl_init();

curl_setopt_array($curl, [
    CURLOPT_URL => "https://{$apiHost}/v1/info?username_or_id_or_url=" . urlencode($username),
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
    http_response_code(500);
    echo json_encode(['error' => "cURL Error: " . $err]);
    exit;
}

// 2. Parse Response
$data = json_decode($response, true);

// Adjust parsing based on specific API response structure (RocketAPI/Instagram Scraper API typical structure)
// Usually: data -> data -> followers
$followers = 0;

if (isset($data['data']['follower_count'])) {
    $followers = $data['data']['follower_count'];
} elseif (isset($data['data']['user']['follower_count'])) {
    $followers = $data['data']['user']['follower_count'];
} elseif (isset($data['data']['edge_followed_by']['count'])) { // Graphql style
    $followers = $data['data']['edge_followed_by']['count'];
} else {
    // Log response for debugging if needed
    // file_put_contents('debug_insta.log', $response);
    http_response_code(502);
    echo json_encode(['error' => 'Nie udało się pobrać liczby followersów. Sprawdź odpowiedź API.', 'response' => $data]);
    exit;
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
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
