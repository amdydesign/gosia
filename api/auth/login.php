<?php
/**
 * Login Endpoint
 * POST /api/auth/login.php
 *
 * Request body: { "username": "...", "password": "...", "remember": true }
 * Response: { "success": true, "data": { "user": {...} } } + the session cookie (config/Session.php)
 *
 * 5 wrong passwords for a login from one address -> 15 minutes pause (20 per address for any login).
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/JWTHandler.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Users.php';
require_once __DIR__ . '/../config/Session.php';
require_once __DIR__ . '/../config/RateLimit.php';

const LOGIN_MAX_TRIES = 5;
const LOGIN_MAX_TRIES_IP = 20;
const LOGIN_PAUSE_MINUTES = 15;

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

// Get POST data
$input = json_decode(file_get_contents('php://input'), true) ?: [];

$username = trim($input['username'] ?? '');
$password = $input['password'] ?? '';
$remember = !array_key_exists('remember', $input) || !empty($input['remember']);

// Validate input
if (empty($username) || empty($password)) {
    Response::validationError([
        'username' => empty($username) ? 'Wpisz login' : null,
        'password' => empty($password) ? 'Wpisz hasło' : null
    ]);
}

try {
    // Get database connection
    $db = new Database();
    $conn = $db->getConnection();

    $ip = RateLimit::ip();
    $userKey = $ip . '|' . mb_strtolower($username);
    $wait = max(
        RateLimit::wait($conn, 'login', $userKey, LOGIN_MAX_TRIES, LOGIN_PAUSE_MINUTES),
        RateLimit::wait($conn, 'login_ip', $ip, LOGIN_MAX_TRIES_IP, LOGIN_PAUSE_MINUTES)
    );
    if ($wait > 0) {
        Response::error('Za dużo prób. Spróbuj za ' . $wait . ' min.', 429);
    }

    // Find user by username
    Users::ensure($conn);
    $stmt = $conn->prepare("SELECT id, username, password_hash, email, display_name, is_admin, is_active, token_version FROM users WHERE username = :username LIMIT 1");
    $stmt->execute(['username' => $username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        RateLimit::hit($conn, 'login', $userKey);
        RateLimit::hit($conn, 'login_ip', $ip);
        Response::error('Zły login albo hasło', 401);
    }

    if ((int) $user['is_active'] !== 1) {
        Response::error('To konto jest zablokowane. Napisz do administratora.', 403);
    }

    RateLimit::clear($conn, 'login', $userKey);

    // Update last login
    $updateStmt = $conn->prepare("UPDATE users SET last_login = NOW() WHERE id = :id");
    $updateStmt->execute(['id' => $user['id']]);

    // Default to 1 if token_version is null
    Session::start($user['id'], $user['username'], $user['token_version'] ?? 1, $remember);

    Response::success([
        'user' => Users::publicData($user)
    ], 'Login successful');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Login failed: ' . $e->getMessage(), 500);
    }
    Response::error('Login failed', 500);
}
