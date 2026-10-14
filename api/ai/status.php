<?php
/**
 * Is screenshot reading available?
 * GET /api/ai/status.php -> { enabled: bool, provider: "claude" | "gemini" | null }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/AiClient.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

getCurrentUserId();
$provider = AiClient::provider();
Response::success(['enabled' => $provider !== null, 'provider' => $provider]);
