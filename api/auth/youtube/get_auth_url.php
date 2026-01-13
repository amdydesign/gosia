<?php
/**
 * YouTube OAuth Redirect
 * GET /api/auth/youtube/redirect.php
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../middleware/auth.php';

// Check if credentials file exists
$credsPath = __DIR__ . '/../../config/social_credentials.php';
if (!file_exists($credsPath)) {
    die("Brak pliku konfiguracyjnego social_credentials.php");
}
$creds = require $credsPath;
$youtube = $creds['youtube'] ?? null;

if (!$youtube || $youtube['client_id'] === 'YOUR_YOUTUBE_CLIENT_ID') {
    die("Skonfiguruj Client ID w api/config/social_credentials.php");
}

// Store user_id in session/state to bind callback
// For simplicity in this specialized app, we'll pass token as 'state' param if needed, 
// or rely on frontend to handle auth state.
// Better approach: frontend calls this, gets URL, user clicks.
// OR: Redirect directly. We need to know WHO connects.
// We will generate a random state and store it in DB or just simpler:
// Pass ?token=JWT to callback? No, insecure.
// We expect the user to be logged in when hitting callback.
// But callback comes from Google.

// Solution: We'll redirect the user to Google.
// The 'state' parameter will contain a simple random string to prevent CSRF.
// When user returns to callback.php, the frontend (React) should actually handle the "landing" and call the API with the code?
// NO, standard OAuth web flow:
// 1. User clicks "Connect" -> simple href to this script.
// 2. This script redirects to Google.
// 3. Google redirects to /api/auth/youtube/callback.php?code=...
// 4. Callback script processes code, SAVES to session?
// Problem: Callback doesn't know the User ID (JWT is in React LocalStorage).
// FIX: We pass the JWT token (or short lived hash) in the 'state' parameter encoded.
// For this MVP single-person app, we'll pass the user ID in state (if we trust it, or encrypted).
// Safe way: Generate a random string, store in DB 'pending_oauth_states' with user_id.

// SIMPLER FOR MVP:
// Frontend calls "get_auth_url.php", sends JWT.
// Backend returns URL.
// Frontend does window.location.href = URL.
// Callback lands on Frontend Route `/auth/callback/youtube?code=...`
// Frontend takes code, sends POST to `/api/auth/youtube/callback.php` WITH JWT.
// This is the cleanest SPA way.

// So this file is actually "get_auth_url.php"

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    // Just verify auth
    /* $userId = getCurrentUserId(); This might fail if token not passed in query/header of this direct link. 
       Actually, if we use the "Frontend handles callback" approach, this current script just returns JSON URL.
    */

    // Scopes needed
    $scope = 'https://www.googleapis.com/auth/youtube.readonly';

    $params = [
        'client_id' => $youtube['client_id'],
        'redirect_uri' => $youtube['redirect_uri'],
        'response_type' => 'code',
        'scope' => $scope,
        'access_type' => 'offline', // For refresh token
        'prompt' => 'consent' // Force prompts to ensure we get refresh token
    ];

    $url = 'https://accounts.google.com/o/oauth2/auth?' . http_build_query($params);

    Response::success(['url' => $url]);

} catch (Exception $e) {
    Response::error('Error: ' . $e->getMessage(), 500);
}
