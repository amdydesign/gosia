<?php
/**
 * JWT Helper Class
 * Handles token generation and validation
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Dotenv\Dotenv;

class JWTHandler
{
    private $secret;
    private $issuer;
    private $expiry_hours = 24; // Token valid for 24 hours

    public function __construct()
    {
        // Load .env
        $dotenv = Dotenv::createImmutable(__DIR__ . '/../');
        $dotenv->safeLoad(); // safeLoad won't throw if already loaded

        $this->secret = $_ENV['JWT_SECRET'];
        $this->issuer = $_ENV['APP_URL'] ?? 'gosia-stylist-manager';
    }

    /**
     * Generate JWT token for user
     */
    public function generateToken($userId, $username, $tokenVersion)
    {
        $issuedAt = time();
        $expiresAt = $issuedAt + ($this->expiry_hours * 3600);

        $payload = [
            'iss' => $this->issuer,          // Issuer
            'iat' => $issuedAt,              // Issued at
            'exp' => $expiresAt,             // Expiration
            'sub' => $userId,                // Subject (user ID)
            'username' => $username,         // Custom claim
            'token_version' => $tokenVersion // Token Version for invalidation
        ];

        return JWT::encode($payload, $this->secret, 'HS256');
    }

    /**
     * Validate JWT token and return payload
     */
    public function validateToken($token)
    {
        try {
            JWT::$leeway = 60; // 60 seconds leeway
            $decoded = JWT::decode($token, new Key($this->secret, 'HS256'));
            return [
                'success' => true,
                'data' => (array) $decoded
            ];
        } catch (\Firebase\JWT\ExpiredException $e) {
            return [
                'success' => false,
                'message' => 'Token expired'
            ];
        } catch (\Exception $e) {
            return [
                'success' => false,
                'message' => 'Invalid token'
            ];
        }
    }

    /**
     * Get token from Authorization header
     */
    public static function getBearerToken()
    {
        $headers = null;

        if (isset($_SERVER['Authorization'])) {
            $headers = trim($_SERVER['Authorization']);
        } elseif (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $headers = trim($_SERVER['HTTP_AUTHORIZATION']);
        } elseif (function_exists('apache_request_headers')) {
            $requestHeaders = apache_request_headers();
            if (isset($requestHeaders['Authorization'])) {
                $headers = trim($requestHeaders['Authorization']);
            }
        }

        if (!empty($headers) && preg_match('/Bearer\s(\S+)/', $headers, $matches)) {
            return $matches[1];
        }

        // Fallback: Check for token in URL query string (for file downloads or when headers are stripped)
        if (isset($_GET['token']) && !empty($_GET['token'])) {
            return $_GET['token'];
        }

        return null;
    }
}
