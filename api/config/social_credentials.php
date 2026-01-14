<?php
return [
    'youtube' => [
        'api_key' => 'AIzaSyCli85Ks3BQTUxwNYCUVafMhkXDOBQOm8A',
        // Channel ID can be hardcoded here OR stored in database via frontend
        // We will store it in database for flexibility
    ],
    'tiktok' => [
        'client_key' => 'sbawlp0dkocuzeoueq',
        'client_secret' => 'hpA0SL7aA19rEhOrIvdSKmCcGl8xRQma',
        'redirect_uri' => 'https://panel.malgorzatamordarska.pl/auth/callback/tiktok'
    ],
    'facebook' => [
        'app_id' => '770922815351899',
        'app_secret' => '4d87d1098cfe2a1eed87417f255200f0',
        'redirect_uri' => 'https://panel.malgorzatamordarska.pl/auth/callback/facebook'
    ],
    'instagram' => [
        'app_id' => 'YOUR_FACEBOOK_APP_ID',
        'app_secret' => 'YOUR_FACEBOOK_APP_SECRET',
        'redirect_uri' => 'https://panel.malgorzatamordarska.pl/auth/callback/instagram'
    ],
    'rapidapi' => [
        'key' => 'e895b43fd6mshad615eb9a25a5c0p13b340jsn697e00c6bcbe', // To be filled by user
        'host' => 'instagram-scraper-stable-api.p.rapidapi.com',
        'username' => 'gosia_mordarska' // Target profile
    ],
    'facebook_rapidapi' => [
        'key' => 'e895b43fd6mshad615eb9a25a5c0p13b340jsn697e00c6bcbe',
        'host' => 'facebook-scraper3.p.rapidapi.com',
        'url' => 'https://www.facebook.com/profile.php?id=61577001039304'
    ]
];
