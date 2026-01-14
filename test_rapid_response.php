<?php
// Debug script for RapidAPI
header('Content-Type: text/plain');

$credentials = require __DIR__ . '/api/config/social_credentials.php';

function test_api($name, $config, $url_template, $query_param_name, $query_param_value)
{
    echo "Testing $name...\n";
    echo "Host: " . $config['host'] . "\n";
    echo "Key: " . substr($config['key'], 0, 5) . "...\n";

    $url = "https://" . $config['host'] . $url_template . "?" . $query_param_name . "=" . urlencode($query_param_value);

    echo "URL: $url\n";

    $curl = curl_init();
    curl_setopt_array($curl, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            "x-rapidapi-host: " . $config['host'],
            "x-rapidapi-key: " . $config['key']
        ],
    ]);

    $response = curl_exec($curl);
    $err = curl_error($curl);
    $info = curl_getinfo($curl);
    curl_close($curl);

    if ($err) {
        echo "cURL Error: $err\n";
    } else {
        echo "Status: " . $info['http_code'] . "\n";
        echo "Response:\n$response\n";
    }
    echo "----------------------------------------\n\n";
}

// 1. Test Instagram
test_api(
    'Instagram',
    $credentials['rapidapi'],
    '/ig_get_fb_profile_hover.php',
    'username_or_url',
    $credentials['rapidapi']['username']
);

// 2. Test Facebook
test_api(
    'Facebook',
    $credentials['facebook_rapidapi'],
    '/page/details',
    'url',
    $credentials['facebook_rapidapi']['url']
);
