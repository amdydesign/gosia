<?php
/**
 * Logout Endpoint
 * POST /api/auth/logout.php
 * 
 * Note: JWT is stateless, so logout is handled client-side
 * This endpoint exists for consistency and potential future token blacklisting
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Response.php';

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

// JWT is stateless - logout is handled by frontend removing token
// This endpoint can be extended to implement token blacklisting if needed

Response::success(null, 'Logged out successfully');
