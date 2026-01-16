<?php
// api/debug_facebook_raw.php
require_once __DIR__ . '/config/Database.php';
$credentials = require __DIR__ . '/config/social_credentials.php';

$apiKey = $credentials['facebook_rapidapi']['key'];
$apiHost = $credentials['facebook_rapidapi']['host'];
$targetUrl = $credentials['facebook_rapidapi']['url'];

echo "Fetching data for: $targetUrl\n";

$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => "https://{$apiHost}/page/details?url=" . urlencode($targetUrl),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ["x-rapidapi-host: {$apiHost}", "x-rapidapi-key: {$apiKey}"],
]);
$response = curl_exec($curl);
$err = curl_error($curl);
curl_close($curl);

if ($err) {
    echo "cURL Error: " . $err;
    exit;
}

$data = json_decode($response, true);

// Recursive Function to find keys
function findKeys($array, $patterns)
{
    foreach ($array as $key => $value) {
        foreach ($patterns as $pattern) {
            if (stripos($key, $pattern) !== false) {
                echo "Found [$key]: " . (is_array($value) ? 'ARRAY' : $value) . "\n";
            }
        }
        if (is_array($value)) {
            findKeys($value, $patterns);
        }
    }
}

echo "--- Searching for follower counts ---\n";
findKeys($data, ['follow', 'like', 'count', 'fan']);
echo "--- Dump of 'followers' field if exists ---\n";
if (isset($data['followers']))
    echo "followers: " . $data['followers'] . "\n";
if (isset($data['likes']))
    echo "likes: " . $data['likes'] . "\n";
if (isset($data['results'])) {
    if (isset($data['results']['followers']))
        echo "results.followers: " . $data['results']['followers'] . "\n";
    if (isset($data['results']['likes']))
        echo "results.likes: " . $data['results']['likes'] . "\n";
}
