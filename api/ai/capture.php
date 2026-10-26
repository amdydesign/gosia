<?php
/**
 * "Zrzuć tutaj" - sort a quick note with AI (Claude Sonnet / Gemini).
 *
 * POST /api/ai/capture.php  { text: "rolka o płaszczach camel" }
 * -> { kind: "idea" | "task" | "purchase" | "collaboration", title, due_date?, idea?, purchase?, collaboration? }
 *
 * Nothing is saved here - the app saves ideas/tasks right away (with "Cofnij")
 * and opens the prefilled form for purchases and collaborations.
 * Without an AI key the app saves the note as a task instead of calling this.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../utils/CapturePrompts.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $text = trim((string) ($input['text'] ?? ''));
    if ($text === '') {
        Response::validationError(['text' => 'Wpisz notatkę']);
    }
    $text = mb_substr($text, 0, 2000);

    $db = new Database();
    AiSettings::apply($db->getConnection(), $userId);
    if (!AiClient::provider()) {
        Response::error('Brak klucza AI', 503);
    }

    $result = AiClient::classifyText(capturePrompt(date('Y-m-d'), date('l')), $text, captureSchema());
    Response::success(normalizeCapture($result, $text));

} catch (RuntimeException $e) {
    Response::error($e->getMessage(), 502);
} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Capture failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się rozpoznać notatki', 500);
}
