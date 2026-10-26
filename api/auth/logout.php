<?php
/**
 * Logout Endpoint
 * POST /api/auth/logout.php
 *
 * Drops the session cookie on this device. Other devices stay logged in
 * (changing the password logs everyone else out).
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Session.php';

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

Session::end();
Response::success(null, 'Logged out successfully');
