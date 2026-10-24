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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

const REELS_TOPICS = 3;
const REELS_EXAMPLES = 15;

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

    // Recorded scripts first (they show what really went out), then drafts
    $stmt = $conn->prepare("
        SELECT title, content, status FROM ideas
        WHERE user_id = :user_id AND content IS NOT NULL AND TRIM(content) <> ''
        ORDER BY CASE WHEN status = 'recorded' THEN 1 ELSE 2 END, updated_at DESC
        LIMIT " . REELS_EXAMPLES
    );
    $stmt->execute(['user_id' => $userId]);
    $examples = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $text = '';
    if ($examples) {
        $text = "Moje rolki (scenariusze):\n\n";
        foreach ($examples as $i => $e) {
            $text .= '### ' . ($i + 1) . '. ' . $e['title'] . ($e['status'] === 'recorded' ? ' (nagrana)' : '') . "\n"
                . mb_substr(trim($e['content']), 0, 2500) . "\n\n";
        }
    }

    if ($step === 'script') {
        $title = trim((string) ($input['title'] ?? ''));
        if ($title === '') {
            Response::validationError(['title' => 'Wpisz temat']);
        }
        $pitch = trim((string) ($input['pitch'] ?? ''));
        $text .= "Temat nowej rolki: " . mb_substr($title, 0, 300) . ($pitch !== '' ? "\nO czym: " . mb_substr($pitch, 0, 500) : '');

        $result = AiClient::writeIdeas(scriptPrompt(date('Y-m-d'), (bool) $examples), $text, scriptSchema());
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
    $stmt = $conn->prepare("SELECT title FROM ideas WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 200");
    $stmt->execute(['user_id' => $userId]);
    $taken = array_merge($stmt->fetchAll(PDO::FETCH_COLUMN), $exclude);
    $text .= "Tematy, które już mam (nie powtarzaj ich):\n- " . implode("\n- ", array_map(function ($t) {
        return mb_substr($t, 0, 120);
    }, $taken));

    $result = AiClient::writeIdeas(topicsPrompt(date('Y-m-d')), $text, topicsSchema(), ['effort' => 'low', 'max_tokens' => 4000]);

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

function topicsPrompt($today)
{
    $count = REELS_TOPICS;
    return <<<PROMPT
Jesteś pomysłodawcą rolek (Instagram Reels / TikTok) dla stylistki i influencerki modowej.
Dzisiaj jest {$today}. Powyżej są jej dotychczasowe scenariusze - tematy i styl, które u niej działają.

Wymyśl {$count} NOWE, wyraźnie różne tematy rolek (jeszcze bez scenariusza).
- Rozwiń to, co u niej działa, pokaż z nowej strony albo połącz z sezonem / okazją (dziś {$today}).
- Nie powtarzaj tematów z listy "Tematy, które już mam".
- title: krótki, chwytliwy tytuł po polsku (do 60 znaków), bez kropki na końcu.
- pitch: jedno krótkie zdanie, o czym będzie rolka (do 120 znaków).
- based_on: tytuł jej rolki, która była główną inspiracją (dokładnie jak na liście), albo pusty tekst.
- Nie wymyślaj marek ani współprac, których nie ma w jej scenariuszach.
PROMPT;
}

function scriptPrompt($today, $hasExamples)
{
    $voice = $hasExamples
        ? 'Pisz jej głosem: ta sama osoba (forma żeńska, "ja"), podobna długość, rytm i słownictwo co w jej scenariuszach powyżej. Nie przepisuj ich.'
        : 'Pisz w pierwszej osobie, forma żeńska, lekko i naturalnie, jak do koleżanki.';
    return <<<PROMPT
Jesteś autorem scenariuszy rolek (Instagram Reels / TikTok) dla stylistki i influencerki modowej. Dzisiaj jest {$today}.
Napisz scenariusz do przeczytania z promptera na podany na końcu temat.

Zasady:
- {$voice}
- content: sam tekst do powiedzenia do kamery, zaczynający się od mocnego pierwszego zdania (hook) w pierwszych 2 sekundach.
  Zwykłe akapity, bez nagłówków, bez emoji, bez opisów ujęć i bez hashtagów. Zwykle 60-150 słów.
- title: krótki tytuł po polsku (do 60 znaków), z wielkiej litery, bez kropki na końcu - na bazie podanego tematu.
- Nie wymyślaj marek, cen ani współprac, których nie ma w temacie ani w jej scenariuszach.
PROMPT;
}

function topicsSchema()
{
    return [
        'type' => 'object',
        'properties' => [
            'topics' => [
                'type' => 'array',
                'items' => [
                    'type' => 'object',
                    'properties' => [
                        'title' => ['type' => 'string'],
                        'pitch' => ['type' => 'string'],
                        'based_on' => ['type' => 'string'],
                    ],
                    'required' => ['title', 'pitch', 'based_on'],
                    'additionalProperties' => false,
                ],
            ],
        ],
        'required' => ['topics'],
        'additionalProperties' => false,
    ];
}

function scriptSchema()
{
    return [
        'type' => 'object',
        'properties' => [
            'title' => ['type' => 'string'],
            'content' => ['type' => 'string'],
        ],
        'required' => ['title', 'content'],
        'additionalProperties' => false,
    ];
}
