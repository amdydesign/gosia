<?php
return [
    'youtube' => [
        'api_key' => $_ENV['SOCIAL_YOUTUBE_API_KEY'] ?? '',
    ],
    'tiktok' => [
        'client_key' => $_ENV['SOCIAL_TIKTOK_CLIENT_KEY'] ?? '',
        'client_secret' => $_ENV['SOCIAL_TIKTOK_CLIENT_SECRET'] ?? '',
        'redirect_uri' => $_ENV['SOCIAL_TIKTOK_REDIRECT_URI'] ?? ''
    ],
    'facebook' => [
        'app_id' => $_ENV['SOCIAL_FACEBOOK_APP_ID'] ?? '',
        'app_secret' => $_ENV['SOCIAL_FACEBOOK_APP_SECRET'] ?? '',
        'redirect_uri' => $_ENV['SOCIAL_FACEBOOK_REDIRECT_URI'] ?? ''
    ],
    'instagram' => [
        'app_id' => $_ENV['SOCIAL_INSTAGRAM_APP_ID'] ?? '',
        'app_secret' => $_ENV['SOCIAL_INSTAGRAM_APP_SECRET'] ?? '',
        'redirect_uri' => $_ENV['SOCIAL_INSTAGRAM_REDIRECT_URI'] ?? ''
    ],
    'rapidapi' => [
        'key' => $_ENV['SOCIAL_RAPIDAPI_KEY'] ?? '',
        'host' => $_ENV['SOCIAL_RAPIDAPI_INSTAGRAM_HOST'] ?? '',
        'username' => 'gosia_mordarska'
    ],
    'facebook_rapidapi' => [
        'key' => $_ENV['SOCIAL_RAPIDAPI_KEY'] ?? '',
        'host' => $_ENV['SOCIAL_RAPIDAPI_FACEBOOK_HOST'] ?? '',
        'url' => 'https://www.facebook.com/profile.php?id=61577001039304'
    ]
];
