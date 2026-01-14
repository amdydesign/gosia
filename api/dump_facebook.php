<?php
$credentials = require __DIR__ . '/config/social_credentials.php';
// Hardcoded based on user request for testing
$apiKey = 'e895b43fd6mshad615eb9a25a5c0p13b340jsn697e00c6bcbe';
$apiHost = 'facebook-scraper3.p.rapidapi.com';
$targetUrl = 'https://www.facebook.com/profile.php?id=61577001039304';

$curl = curl_init();

curl_setopt_array($curl, [
    CURLOPT_URL => "https://{$apiHost}/page/details?url=" . urlencode($targetUrl),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        "x-rapidapi-host: {$apiHost}",
        "x-rapidapi-key: {$apiKey}"
    ],
]);

$response = curl_exec($curl);
$err = curl_error($curl);
curl_close($curl);

if ($err) {
    echo "cURL Error: " . $err;
} else {
    // Decode and find keywords
    $data = json_decode($response, true);
    $json = json_encode($data, JSON_PRETTY_PRINT);

    // Look for likes or followers
    if (preg_match('/(".*?likes.*?"\s*:\s*\d+)/i', $json, $matches)) {
        echo "FOUND LIKES:\n" . print_r($matches, true) . "\n\n";
    }
    if (preg_match('/(".*?followers.*?"\s*:\s*\d+)/i', $json, $matches)) {
        echo "FOUND FOLLOWERS:\n" . print_r($matches, true) . "\n\n";
    }

    // Print first 2000 chars to verify structure
    echo "Snapshot:\n" . substr($json, 0, 2000);
}
