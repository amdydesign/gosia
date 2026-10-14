<?php
/**
 * AI key settings (Ustawienia -> Czytanie screenów).
 *
 * GET  /api/settings/ai.php
 *      -> { enabled, provider, claude: { set, source: "app"|"env"|null, hint }, gemini: {...} }
 * POST /api/settings/ai.php
 *      body: { provider?: "claude"|"gemini", key?: "...", remove?: "claude"|"gemini" }
 *      A new key is checked with the provider (free model list) before it is saved.
 *      -> same as GET + { verified: true|null }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../middleware/auth.php';

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        AiSettings::apply($conn, $userId);
        Response::success(AiSettings::describe());
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        Response::error('Method not allowed', 405);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $provider = $input['provider'] ?? null;
    if ($provider !== null && !in_array($provider, AiSettings::PROVIDERS, true)) {
        Response::error('Nieznany dostawca AI', 400);
    }

    $verified = null;
    $key = preg_replace('/\s+/', '', (string) ($input['key'] ?? ''));
    if ($key !== '') {
        if (!$provider) {
            Response::error('Wybierz Claude albo Gemini', 400);
        }
        if (strlen($key) < 20 || strlen($key) > 300) {
            Response::validationError(['key' => 'To nie wygląda na klucz API - skopiuj go jeszcze raz.']);
        }
        @set_time_limit(40);
        $verified = AiClient::verifyKey($provider, $key);
        if ($verified === false) {
            $name = $provider === 'claude' ? 'Claude' : 'Gemini';
            Response::validationError(['key' => "{$name} nie przyjął tego klucza. Sprawdź, czy skopiowałaś go w całości."]);
        }
        AiSettings::saveKey($conn, $userId, $provider, $key);
    }

    if (in_array($input['remove'] ?? null, AiSettings::PROVIDERS, true)) {
        AiSettings::saveKey($conn, $userId, $input['remove'], null);
    }

    if ($provider) {
        AiSettings::saveProvider($conn, $userId, $provider);
    }

    AiSettings::apply($conn, $userId);
    Response::success(AiSettings::describe() + ['verified' => $verified]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('AI settings failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać ustawień AI', 500);
}
