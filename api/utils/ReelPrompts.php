<?php
/**
 * "Generator rolek" prompts - shared by api/ai/reels.php and the model test
 * (api/cron/compare_models.php), so the test checks exactly what the app sends.
 */

require_once __DIR__ . '/../config/Schema.php';

const REELS_TOPICS = 3;
const REELS_EXAMPLES = 15;
// Picking 3 topics is light work; the script itself uses AiClient::writeIdeas defaults (medium effort)
const REELS_TOPICS_OPTIONS = ['effort' => 'low', 'max_tokens' => 4000];

/**
 * Her scripts as prompt text: published ones with the most views first (what really works),
 * then recorded, then drafts. @return [string $text, array $rows]
 */
function reelExamples(PDO $conn, $userId)
{
    Schema::ensureColumns($conn, 'ideas');
    $stmt = $conn->prepare("
        SELECT title, content, status, views FROM ideas
        WHERE user_id = :user_id AND content IS NOT NULL AND TRIM(content) <> ''
        ORDER BY CASE WHEN views IS NOT NULL THEN 0 WHEN status = 'recorded' THEN 1 ELSE 2 END, views DESC, updated_at DESC
        LIMIT " . REELS_EXAMPLES
    );
    $stmt->execute(['user_id' => $userId]);
    $examples = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $text = '';
    if ($examples) {
        $withViews = array_filter($examples, function ($e) {
            return $e['views'] !== null;
        });
        $text = "Moje rolki (scenariusze)" . ($withViews ? ' - przy opublikowanych liczba wyświetleń: więcej wyświetleń = to działa, opieraj się na nich najbardziej' : '') . ":\n\n";
        foreach ($examples as $i => $e) {
            $label = $e['views'] !== null ? ' (' . number_format((int) $e['views'], 0, ',', ' ') . ' wyświetleń)' : ($e['status'] === 'recorded' ? ' (nagrana)' : '');
            $text .= '### ' . ($i + 1) . '. ' . $e['title'] . $label . "\n"
                . mb_substr(trim($e['content']), 0, 2500) . "\n\n";
        }
    }
    return [$text, $examples];
}

/** "Don't repeat these" list: every idea title plus topics already shown. */
function reelTakenTopics(PDO $conn, $userId, array $exclude = [])
{
    $stmt = $conn->prepare("SELECT title FROM ideas WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 200");
    $stmt->execute(['user_id' => $userId]);
    $taken = array_merge($stmt->fetchAll(PDO::FETCH_COLUMN), $exclude);
    return "Tematy, które już mam (nie powtarzaj ich):\n- " . implode("\n- ", array_map(function ($t) {
        return mb_substr($t, 0, 120);
    }, $taken));
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
  Zwykłe akapity, bez nagłówków, bez emoji, bez opisów ujęć, bez hashtagów i bez wskazówek wymowy w nawiasach.
- Długość: 60-150 słów (do ok. minuty mówienia), chyba że jej scenariusze są wyraźnie krótsze.
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
