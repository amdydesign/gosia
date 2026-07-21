<?php
/**
 * Wspólny bootstrap wszystkich endpointów API.
 *
 * Użycie na początku endpointu:
 *   require_once __DIR__ . '/../bootstrap.php';
 *   requireMethod('POST');
 *   $userId = getCurrentUserId();
 *   $conn = db();
 */

require_once __DIR__ . '/vendor/autoload.php';

use Dotenv\Dotenv;

// .env ładowany dokładnie raz na request
Dotenv::createImmutable(__DIR__)->safeLoad();

// CORS + nagłówki bezpieczeństwa + obsługa preflight (OPTIONS kończy request)
require_once __DIR__ . '/config/cors.php';

require_once __DIR__ . '/config/Response.php';
require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/config/JWTHandler.php';
require_once __DIR__ . '/config/Validator.php';
require_once __DIR__ . '/config/Crypto.php';
require_once __DIR__ . '/middleware/auth.php';

// Nieprzechwycone wyjątki nigdy nie ujawniają szczegółów bez APP_DEBUG
set_exception_handler(function ($e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Server error: ' . $e->getMessage(), 500);
    }
    Response::error('Server error', 500);
});

/**
 * Kończy request odpowiedzią 405, jeśli metoda HTTP się nie zgadza.
 */
function requireMethod($method)
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        Response::error('Method not allowed', 405);
    }
}

/**
 * Współdzielone połączenie PDO (jedno na request).
 */
function db()
{
    return Database::getInstance()->getConnection();
}

/**
 * Zdekodowane body JSON requestu (pusta tablica, gdy brak/niepoprawne).
 */
function jsonInput()
{
    return json_decode(file_get_contents('php://input'), true) ?? [];
}
