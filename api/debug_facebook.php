<?php
$credentials = require __DIR__ . '/config/social_credentials.php';
// Reuse key if technically possible, but user provided specific command.
// We will use the key relative to the user's input/config.
// For this debug script, I'll use the hardcoded values from the user's request for certainty.

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
    echo "Response:\n" . $response;
}
