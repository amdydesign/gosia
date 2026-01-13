<?php
return [
    'youtube' => [
        'api_key' => 'AIzaSyCli85Ks3BQTUxwNYCUVafMhkXDOBQOm8A',
        // Channel ID can be hardcoded here OR stored in database via frontend
        // We will store it in database for flexibility
    ],
    'instagram' => [
        // Instagram still requires OAuth or RapidAPI usually, but we'll deal with it later
    ],
    'tiktok' => [
        'client_key' => 'sbawlp0dkocuzeoueq',
        'client_secret' => 'hpA0SL7aA19rEhOrIvdSKmCcGl8xRQma',
        'redirect_uri' => 'https://panel.malgorzatamordarska.pl/auth/callback/tiktok'
    ]
];
