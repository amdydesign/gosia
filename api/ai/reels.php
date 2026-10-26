<?php
/**
 * "Generator rolek" - in two steps, both in the style of the recorded reels:
 *
 * POST /api/ai/reels.php  { step: "topics", exclude: ["tytuł już pokazany", ...] }
 *   -> { topics: [{ title, pitch, based_on }] }       3 short ideas to pick from
 * POST /api/ai/reels.php  { step: "script", title: "...", pitch: "..." }
 *   -> { title, content }                              script for the picked or own topic
 *
 * Nothing is saved here - the app adds an idea only when "Dodaj do pomysłów" is tapped.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../utils/ReelPrompts.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $step = ($input['step'] ?? 'topics') === 'script' ? 'script' : 'topics';

    $db = new Database();
    $conn = $db->getConnection();
    AiSettings::apply($conn, $userId);
    if (!AiClient::provider()) {
        Response::error('Generator rolek wymaga klucza AI (Ustawienia -> Czytanie screenów).', 503);
    }

    [$text, $examples] = reelExamples($conn, $userId);

    if ($step === 'script') {
        $title = trim((string) ($input['title'] ?? ''));
        if ($title === '') {
            Response::validationError(['title' => 'Wpisz temat']);
        }
        $pitch = trim((string) ($input['pitch'] ?? ''));
        $topic = "Temat nowej rolki: " . mb_substr($title, 0, 300) . ($pitch !== '' ? "\nO czym: " . mb_substr($pitch, 0, 500) : '');

        // her scripts first and cached: "Napisz jeszcze raz" reuses them at a tenth of the price
        $parts = $text !== '' ? [['text' => $text, 'cache' => true], ['text' => $topic]] : [['text' => $topic]];
        $result = AiClient::writeIdeas(scriptPrompt(date('Y-m-d'), (bool) $examples), $parts, scriptSchema());
        $content = trim((string) ($result['content'] ?? ''));
        if ($content === '') {
            Response::error('AI nie napisało scenariusza. Spróbuj jeszcze raz.', 502);
        }
        Response::success([
            'title' => mb_substr(trim((string) ($result['title'] ?? '')) ?: $title, 0, 200),
            'content' => $content,
        ]);
    }

    if (!$examples) {
        Response::error('Najpierw zapisz kilka rolek ze scenariuszem albo wpisz własny temat.', 422);
    }

    $exclude = array_slice(array_filter(array_map('strval', (array) ($input['exclude'] ?? []))), 0, 50);
    $parts = [['text' => $text, 'cache' => true], ['text' => reelTakenTopics($conn, $userId, $exclude)]];

    $result = AiClient::writeIdeas(topicsPrompt(date('Y-m-d')), $parts, topicsSchema(), REELS_TOPICS_OPTIONS);

    $topics = [];
    foreach (($result['topics'] ?? []) as $t) {
        $title = trim((string) ($t['title'] ?? ''));
        if ($title === '') {
            continue;
        }
        $topics[] = [
            'title' => mb_substr($title, 0, 200),
            'pitch' => trim((string) ($t['pitch'] ?? '')),
            'based_on' => trim((string) ($t['based_on'] ?? '')),
        ];
    }
    if (!$topics) {
        Response::error('AI nie wymyśliło nic nowego. Spróbuj jeszcze raz.', 502);
    }
    Response::success(['topics' => array_slice($topics, 0, REELS_TOPICS)]);

} catch (RuntimeException $e) {
    Response::error($e->getMessage(), 502);
} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Reels failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się wygenerować rolek', 500);
}
