<?php
/**
 * Authentication Middleware
 * Validates JWT token before allowing access to protected routes
 */

require_once __DIR__ . '/../config/JWTHandler.php';
require_once __DIR__ . '/../config/Response.php';

class AuthMiddleware
{
    private $jwtHandler;

    public function __construct()
    {
        $this->jwtHandler = new JWTHandler();
    }

    /**
     * Authenticate request
     * Returns user data if authenticated, sends 401 response if not
     */
    public function authenticate()
    {
        $token = JWTHandler::getBearerToken();

        if (!$token) {
            Response::unauthorized('No token provided');
        }

        $result = $this->jwtHandler->validateToken($token);

        if (!$result['success']) {
            Response::unauthorized($result['message']);
        }

        return $result['data'];
    }

    /**
     * Get current user ID from token
     */
    public function getUserId()
    {
        $userData = $this->authenticate();
        return $userData['sub'];
    }
}

/**
 * Helper function for quick authentication
 */
function requireAuth()
{
    $auth = new AuthMiddleware();
    return $auth->authenticate();
}

function getCurrentUserId()
{
    $auth = new AuthMiddleware();
    return $auth->getUserId();
}
