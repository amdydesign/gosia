<?php
/**
 * Authentication Middleware
 * Validates JWT token before allowing access to protected routes
 */

require_once __DIR__ . '/../config/JWTHandler.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Users.php';
require_once __DIR__ . '/../config/Session.php';

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
            $this->reject($result['message']);
        }

        $payload = $result['data'];

        // The cookie is sent by the browser on its own - writes must come from the app (CSRF)
        if (JWTHandler::$source === 'cookie' && !Session::isAppRequest()) {
            Response::error('Odśwież aplikację i spróbuj ponownie', 403);
        }

        // Check token version against DB
        try {
            $db = new Database();
            $conn = $db->getConnection();

            Users::ensure($conn);
            $stmt = $conn->prepare("SELECT token_version, is_active FROM users WHERE id = :id");
            $stmt->execute(['id' => $payload['sub']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                $this->reject('User not found');
            }
            if ((int) $user['is_active'] !== 1) {
                $this->reject('Konto jest zablokowane');
            }

            // If token has no version (old token) or versions don't match -> Unauthorized
            // We treat null DB version as 1.
            $dbVersion = $user['token_version'] ?? 1;
            $tokenVersion = $payload['token_version'] ?? 0; // Old tokens won't have this field

            if ($tokenVersion != $dbVersion) {
                $this->reject('Session expired, please login again');
            }

        } catch (Exception $e) {
            Response::error('Authentication error', 500);
        }

        if (JWTHandler::$source === 'cookie') {
            Session::renewIfOld($payload);
        } elseif (Session::cookieToken() === null) {
            // An older app version still sends its stored token: move this device to the cookie
            Session::start($payload['sub'], $payload['username'] ?? '', $payload['token_version'] ?? 1, true);
        }

        return $payload;
    }

    /** 401 - and drop a cookie that no longer works, so the browser stops sending it. */
    private function reject($message)
    {
        if (JWTHandler::$source === 'cookie') {
            Session::end();
        }
        Response::unauthorized($message);
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

/**
 * Logged-in admin's id, or 403 for everyone else (managing accounts).
 */
function requireAdminId(PDO $conn)
{
    $userId = getCurrentUserId();
    if (!Users::isAdmin($conn, $userId)) {
        Response::error('Tylko administrator może zarządzać kontami', 403);
    }
    return (int) $userId;
}
