<?php
/**
 * Login Endpoint
 * POST /api/auth/login.php
 * 
 * Request body: { "username": "...", "password": "..." }
 * Response: { "success": true, "data": { "token": "...", "user": {...} } }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/JWTHandler.php';
require_once __DIR__ . '/../config/Response.php';

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);

$username = trim($input['username'] ?? '');
$password = $input['password'] ?? '';

// Validate input
if (empty($username) || empty($password)) {
    Response::validationError([
        'username' => empty($username) ? 'Username is required' : null,
        'password' => empty($password) ? 'Password is required' : null
    ]);
}

try {
    // Get database connection
    $db = new Database();
    $conn = $db->getConnection();

    // Find user by username
    $stmt = $conn->prepare("SELECT id, username, password_hash, email FROM users WHERE username = :username LIMIT 1");
    $stmt->execute(['username' => $username]);
    $user = $stmt->fetch();

    // Check if user exists
    if (!$user) {
        Response::error('Invalid username or password', 401);
    }

    // Verify password
    if (!password_verify($password, $user['password_hash'])) {
        Response::error('Invalid username or password', 401);
    }

    // Update last login
    $updateStmt = $conn->prepare("UPDATE users SET last_login = NOW() WHERE id = :id");
    $updateStmt->execute(['id' => $user['id']]);

    // Generate JWT token
    $jwtHandler = new JWTHandler();
    $token = $jwtHandler->generateToken($user['id'], $user['username']);

    // Prepare user data (without password)
    $userData = [
        'id' => $user['id'],
        'username' => $user['username'],
        'email' => $user['email']
    ];

    // Send success response
    Response::success([
        'token' => $token,
        'user' => $userData
    ], 'Login successful');

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Login failed: ' . $e->getMessage(), 500);
    }
    Response::error('Login failed', 500);
}
