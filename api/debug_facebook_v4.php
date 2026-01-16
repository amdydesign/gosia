<?php
// api/debug_facebook_v4.php

$apiKey = 'e895b43fd6mshad615eb9a25a5c0p13b340jsn697e00c6bcbe';
$apiHost = 'facebook-scraper-api4.p.rapidapi.com';
$targetLink = 'https://www.facebook.com/profile.php?id=61577001039304';

$params = [
    'link' => $targetLink,
    'exact_followers_count' => 'true',
    'show_verified_badge' => 'false',
    'proxy_country' => 'us',
    'page_section' => 'default'
];

$query = http_build_query($params);
$url = "https://{$apiHost}/get_facebook_pages_details_from_link?" . $query;

echo "Requesting URL: $url\n\n";

$curl = curl_init();

curl_setopt_array($curl, [
    CURLOPT_URL => $url,
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
    echo "cURL Error: " . $err;
} else {
    echo "Response:\n";
    echo $response;

    $data = json_decode($response, true);
    if (json_last_error() === JSON_ERROR_NONE) {
        echo "\n\n--- Analysis ---\n";
        if (isset($data['body']['followers_count'])) {
            echo "Found 'body.followers_count': " . $data['body']['followers_count'] . "\n";
        } elseif (isset($data['followers_count'])) {
            echo "Found 'followers_count': " . $data['followers_count'] . "\n";
        } elseif (isset($data['data']['followers_count'])) {
            echo "Found 'data.followers_count': " . $data['data']['followers_count'] . "\n";
        } else {
            // Try to find any key with 'follower'
            array_walk_recursive($data, function ($item, $key) {
                if (stripos($key, 'follower') !== false) {
                    echo "Found key [$key]: $item\n";
                }
            });
        }
    }
}
