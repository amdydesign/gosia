<?php
/**
 * CORS Configuration
 * Include this file at the top of all API endpoints
 */

// Allow from React app origin
$allowedOrigins = [
    'http://localhost:5173',     // Vite dev server
    'http://localhost:3000',     // Alternative dev port
    'https://panel.malgorzatamordarska.pl',  // Production
    'http://panel.malgorzatamordarska.pl'    // Production (http)
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowedOrigins)) {
    header("Access-Control-Allow-Origin: $origin");
}

header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Max-Age: 86400"); // 24 hours cache

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Set JSON content type for all responses
header('Content-Type: application/json; charset=utf-8');
