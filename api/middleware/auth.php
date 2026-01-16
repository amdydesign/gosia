<?php
/**
 * Authentication Middleware
 * Validates JWT token before allowing access to protected routes
 */

require_once __DIR__ . '/../config/JWTHandler.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Database.php';

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

        $payload = $result['data'];

        // Check token version against DB
        try {
            $db = new Database();
            $conn = $db->getConnection();

            $stmt = $conn->prepare("SELECT token_version FROM users WHERE id = :id");
            $stmt->execute(['id' => $payload['sub']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                Response::unauthorized('User not found');
            }

            // If token has no version (old token) or versions don't match -> Unauthorized
            // We treat null DB version as 1.
            $dbVersion = $user['token_version'] ?? 1;
            $tokenVersion = $payload['token_version'] ?? 0; // Old tokens won't have this field

            if ($tokenVersion != $dbVersion) {
                Response::unauthorized('Session expired, please login again');
            }

        } catch (Exception $e) {
            Response::error('Authentication error', 500);
        }

        return $payload;
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
