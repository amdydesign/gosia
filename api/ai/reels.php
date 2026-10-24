<?php
/**
 * "Generator rolek" - new reel ideas with scripts, written in the style of the recorded ones.
 *
 * POST /api/ai/reels.php  { exclude: ["tytuł już pokazany", ...] }
 * -> { ideas: [{ title, content, based_on }], source: number of scripts used }
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

const REELS_COUNT = 3;
const REELS_EXAMPLES = 15;

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $exclude = array_slice(array_filter(array_map('strval', (array) ($input['exclude'] ?? []))), 0, 50);

    $db = new Database();
    $conn = $db->getConnection();
    AiSettings::apply($conn, $userId);
    if (!AiClient::provider()) {
        Response::error('Generator rolek wymaga klucza AI (Ustawienia -> Czytanie screenów).', 503);
    }

    // Recorded scripts first (they show what really went out), then drafts if there are too few
    $stmt = $conn->prepare("
        SELECT title, content, status FROM ideas
        WHERE user_id = :user_id AND content IS NOT NULL AND TRIM(content) <> ''
        ORDER BY CASE WHEN status = 'recorded' THEN 1 ELSE 2 END, updated_at DESC
        LIMIT " . REELS_EXAMPLES
    );
    $stmt->execute(['user_id' => $userId]);
    $examples = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!$examples) {
        Response::error('Najpierw zapisz kilka rolek ze scenariuszem - generator uczy się na nich.', 422);
    }

    $stmt = $conn->prepare("SELECT title FROM ideas WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 200");
    $stmt->execute(['user_id' => $userId]);
    $taken = array_merge($stmt->fetchAll(PDO::FETCH_COLUMN), $exclude);

    $text = "Moje rolki (scenariusze):\n\n";
    foreach ($examples as $i => $e) {
        $text .= '### ' . ($i + 1) . '. ' . $e['title'] . ($e['status'] === 'recorded' ? ' (nagrana)' : '') . "\n"
            . mb_substr(trim($e['content']), 0, 2500) . "\n\n";
    }
    $text .= "Tematy, które już mam (nie powtarzaj ich):\n- " . implode("\n- ", array_map(function ($t) {
        return mb_substr($t, 0, 120);
    }, $taken));

    $result = AiClient::writeIdeas(reelsPrompt(date('Y-m-d')), $text, reelsSchema());

    $ideas = [];
    foreach (($result['ideas'] ?? []) as $idea) {
        $title = trim((string) ($idea['title'] ?? ''));
        $content = trim((string) ($idea['content'] ?? ''));
        if ($title === '' || $content === '') {
            continue;
        }
        $ideas[] = [
            'title' => mb_substr($title, 0, 200),
            'content' => $content,
            'based_on' => trim((string) ($idea['based_on'] ?? '')),
        ];
    }
    if (!$ideas) {
        Response::error('AI nie wymyśliło nic nowego. Spróbuj jeszcze raz.', 502);
    }

    Response::success(['ideas' => array_slice($ideas, 0, REELS_COUNT), 'source' => count($examples)]);

} catch (RuntimeException $e) {
    Response::error($e->getMessage(), 502);
} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Reels failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się wygenerować rolek', 500);
}

function reelsPrompt($today)
{
    $count = REELS_COUNT;
    return <<<PROMPT
Jesteś autorem scenariuszy rolek (Instagram Reels / TikTok) dla stylistki i influencerki modowej.
Dzisiaj jest {$today}. Powyżej są jej dotychczasowe scenariusze - to jej głos, styl mówienia i tematy, które działają.

Wymyśl {$count} NOWE pomysły na rolki, każdy z gotowym scenariuszem do przeczytania z promptera.

Zasady:
- Pisz jej głosem: ta sama osoba (forma żeńska, "ja"), podobna długość, rytm i słownictwo co w jej scenariuszach.
- Każdy pomysł inny: rozwiń temat, który u niej działa, pokaż go z nowej strony albo połącz z sezonem / okazją (dziś {$today}).
- Nie powtarzaj tematów z listy "Tematy, które już mam" ani nie przepisuj jej scenariuszy.
- title: krótki, konkretny tytuł po polsku (do 60 znaków), bez kropki na końcu.
- content: sam tekst do powiedzenia do kamery, zaczynający się od mocnego pierwszego zdania (hook) w pierwszych 2 sekundach.
  Zwykłe akapity, bez nagłówków, bez emoji, bez opisów ujęć i bez hashtagów. Zwykle 60-150 słów, chyba że jej scenariusze są wyraźnie dłuższe lub krótsze.
- based_on: tytuł jej rolki, która była główną inspiracją (dokładnie jak na liście), albo pusty tekst.
- Nie wymyślaj nazw marek, cen ani współprac, których nie ma w jej scenariuszach.
PROMPT;
}

function reelsSchema()
{
    return [
        'type' => 'object',
        'properties' => [
            'ideas' => [
                'type' => 'array',
                'items' => [
                    'type' => 'object',
                    'properties' => [
                        'title' => ['type' => 'string'],
                        'content' => ['type' => 'string'],
                        'based_on' => ['type' => 'string'],
                    ],
                    'required' => ['title', 'content', 'based_on'],
                    'additionalProperties' => false,
                ],
            ],
        ],
        'required' => ['ideas'],
        'additionalProperties' => false,
    ];
}
