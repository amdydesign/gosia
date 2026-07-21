<?php
/**
 * Verify Token Endpoint
 * GET /api/auth/verify.php
 * 
 * Headers: Authorization: Bearer <token>
 * Response: { "success": true, "data": { "user": {...} } }
 */

require_once __DIR__ . '/../bootstrap.php';
requireMethod('GET');

try {
    // Authenticate - will return error if token invalid
    $tokenData = requireAuth();

    // Get fresh user data from database
    $conn = db();

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
