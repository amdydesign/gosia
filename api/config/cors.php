<?php
/**
 * CORS Configuration
 * Include this file at the top of all API endpoints
 */

// Allow from React app origin
$allowedOrigins = [
    'https://panel.malgorzatamordarska.pl',  // Production
];
// Dev servers only with APP_DEBUG=true in api/.env (read here - this file runs before Database loads it)
if (corsDebugMode()) {
    $allowedOrigins[] = 'http://localhost:5173'; // Vite dev server
    $allowedOrigins[] = 'http://localhost:3000'; // Alternative dev port
}

function corsDebugMode()
{
    if (isset($_ENV['APP_DEBUG'])) {
        return $_ENV['APP_DEBUG'] === 'true';
    }
    $env = @file_get_contents(__DIR__ . '/../.env');
    return $env !== false && preg_match('/^\s*APP_DEBUG\s*=\s*["\']?true["\']?\s*$/mi', $env) === 1;
}

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

// Security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');

