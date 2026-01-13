<?php
/**
 * Verify Token Endpoint
 * GET /api/auth/verify.php
 * 
 * Headers: Authorization: Bearer <token>
 * Response: { "success": true, "data": { "user": {...} } }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

// Only allow GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    // Authenticate - will return error if token invalid
    $tokenData = requireAuth();

    // Get fresh user data from database
    $db = new Database();
    $conn = $db->getConnection();

    $stmt = $conn->prepare("SELECT id, username, email, last_login FROM users WHERE id = :id LIMIT 1");
    $stmt->execute(['id' => $tokenData['sub']]);
    $user = $stmt->fetch();

    if (!$user) {
        Response::error('User not found', 404);
    }

    Response::success([
        'user' => $user
    ], 'Token valid');

} catch (Exception $e) {
    Response::error('Verification failed', 500);
}
