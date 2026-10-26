<?php
/**
 * "Generator rolek" prompts - shared by api/ai/reels.php and the model test
 * (api/cron/compare_models.php), so the test checks exactly what the app sends.
 */

require_once __DIR__ . '/../config/Schema.php';

const REELS_TOPICS = 3;
// AI proposes more than it shows: the ones too close to her ideas, recorded reels
// or earlier suggestions are thrown out on the server (the model alone still repeats)
const REELS_TOPIC_CANDIDATES = 6;
const REELS_EXAMPLES = 15;
// Picking 3 topics is light work; the script itself uses AiClient::writeIdeas defaults (medium effort)
const REELS_TOPICS_OPTIONS = ['effort' => 'low', 'max_tokens' => 4000];
// A fix of one script ("krócej", "mocniejszy hook") - only that script goes in, so it stays cheap
const REELS_REVISE_OPTIONS = ['effort' => 'low', 'max_tokens' => 3000];
const REELS_NOTES = 8;

/** Her notes to a script ("krócej", "bez słowa X"), cleaned: the last REELS_NOTES, each short. */
function reelNotes($notes)
{
    $clean = [];
    foreach ((array) $notes as $note) {
        $note = trim((string) $note);
        if ($note !== '') {
            $clean[] = mb_substr($note, 0, 300);
        }
    }
    return array_slice($clean, -REELS_NOTES);
}

function reelNotesText(array $notes)
{
    return $notes ? "Moje uwagi (od najstarszej, ostatnia najważniejsza):\n- " . implode("\n- ", $notes) : '';
}

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

/**
 * Everything that must not come back: her ideas (recorded first), topics shown before
 * (all of them, kept on the server - a new tab or phone doesn't start over) and this tab's list.
 * @return array [['title' => ..., 'recorded' => bool], ...]
 */
function reelTaken(PDO $conn, $userId, array $exclude = [])
{
    $stmt = $conn->prepare("
        SELECT title, status FROM ideas WHERE user_id = :user_id
        ORDER BY status = 'recorded' DESC, created_at DESC
    ");
    $stmt->execute(['user_id' => $userId]);
    $taken = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $taken[] = ['title' => $row['title'], 'recorded' => $row['status'] === 'recorded'];
    }
    Schema::ensure($conn, 'reel_topics_seen');
    $stmt = $conn->prepare("SELECT title FROM reel_topics_seen WHERE user_id = :user_id ORDER BY shown_at DESC");
    $stmt->execute(['user_id' => $userId]);
    foreach (array_merge($stmt->fetchAll(PDO::FETCH_COLUMN), $exclude) as $title) {
        $taken[] = ['title' => (string) $title, 'recorded' => false];
    }
    return $taken;
}

/** "Don't repeat these" list for the prompt (the newest 250 - the server filter checks all of them). */
function reelTakenTopics(PDO $conn, $userId, array $exclude = [])
{
    $lines = [];
    foreach (array_slice(reelTaken($conn, $userId, $exclude), 0, 250) as $t) {
        $lines[] = mb_substr($t['title'], 0, 120) . ($t['recorded'] ? ' (nagrana)' : '');
    }
    return "Tematy, które już mam albo już widziałam (nie powtarzaj ich ani pod innym tytułem):\n- " . implode("\n- ", $lines);
}

/** Topics shown now - remembered for good, so they are never offered again. */
function reelRememberTopics(PDO $conn, $userId, array $titles)
{
    Schema::ensure($conn, 'reel_topics_seen');
    $stmt = $conn->prepare("INSERT INTO reel_topics_seen (user_id, title, shown_at) VALUES (:user_id, :title, :at)");
    foreach ($titles as $title) {
        $stmt->execute(['user_id' => $userId, 'title' => mb_substr($title, 0, 255), 'at' => date('Y-m-d H:i:s')]);
    }
}

/**
 * Meaningful word stems of a title: lowercase, no Polish letters, words of 4+ letters cut
 * to 5, without filler ("sposoby", "stylizacja", "look") - "Jak nosić szary płaszcz" and
 * "3 sposoby na szary płaszcz" both give [szary, plasz].
 */
function reelKeywords($text)
{
    static $skip = ['spos', 'sposo', 'rzecz', 'ktory', 'ktore', 'ktora', 'twoja', 'twoje', 'twoj', 'moja', 'moje', 'kazda',
        'kazdy', 'kiedy', 'tylko', 'bardz', 'zamia', 'czego', 'dlacz', 'teraz', 'wszys', 'najle', 'zawsz', 'nigdy', 'mozes',
        'powin', 'styli', 'stylo', 'outfi', 'look', 'looki', 'lookow', 'pomys', 'trzy', 'czter', 'piec', 'sposob', 'jakie',
        'jaki', 'jaka', 'jest', 'sobie', 'tego', 'tych', 'nosic', 'ubrac', 'zrobi', 'wiesz', 'warto', 'robic'];
    $text = mb_strtolower((string) $text, 'UTF-8');
    $text = strtr($text, ['ą' => 'a', 'ć' => 'c', 'ę' => 'e', 'ł' => 'l', 'ń' => 'n', 'ó' => 'o', 'ś' => 's', 'ź' => 'z', 'ż' => 'z']);
    $stems = [];
    foreach (preg_split('/[^a-z0-9]+/', $text) as $word) {
        if (strlen($word) < 4) {
            continue;
        }
        $stem = substr($word, 0, 5);
        if (!in_array($stem, $skip, true) && !in_array(substr($word, 0, 4), $skip, true)) {
            $stems[$stem] = true;
        }
    }
    return array_keys($stems);
}

/** Same topic in other words? Most of the shorter title's stems are in the other one. */
function reelIsSimilar(array $a, array $b)
{
    if (!$a || !$b) {
        return false;
    }
    $common = count(array_intersect($a, $b));
    $shorter = min(count($a), count($b));
    return $shorter === 1 ? $common === 1 && max(count($a), count($b)) <= 2 : $common / $shorter >= 0.6;
}

/** The candidates that are new: not like anything taken, and not like each other. */
function reelFilterNew(array $candidates, array $taken)
{
    $known = [];
    foreach ($taken as $t) {
        $known[] = reelKeywords($t['title']);
    }
    $fresh = [];
    foreach ($candidates as $c) {
        $words = reelKeywords($c['title']);
        $repeat = false;
        foreach ($known as $k) {
            if (reelIsSimilar($words, $k)) {
                $repeat = true;
                break;
            }
        }
        if (!$repeat) {
            $fresh[] = $c;
            $known[] = $words;
        }
    }
    return $fresh;
}

function topicsPrompt($today)
{
    $count = REELS_TOPIC_CANDIDATES;
    return <<<PROMPT
Jesteś pomysłodawcą rolek (Instagram Reels / TikTok) dla stylistki i influencerki modowej.
Dzisiaj jest {$today}. Powyżej są jej dotychczasowe scenariusze - tematy i styl, które u niej działają.

Wymyśl {$count} NOWE, wyraźnie różne tematy rolek (jeszcze bez scenariusza).
- Rozwiń to, co u niej działa, pokaż z nowej strony albo połącz z sezonem / okazją (dziś {$today}).
- Nie powtarzaj tematów z listy "Tematy, które już mam" - ani tych samych pod innym tytułem, ani tego samego pomysłu innymi słowami.
  Szczególnie nie wracaj do rolek oznaczonych "(nagrana)".
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

function revisePrompt($today)
{
    return <<<PROMPT
Poprawiasz scenariusz rolki (Instagram Reels / TikTok) stylistki i influencerki modowej. Dzisiaj jest {$today}.
Powyżej jest aktualny scenariusz i jej uwagi. Wprowadź WSZYSTKIE uwagi (ostatnia jest najważniejsza), a resztę zostaw jak jest.

Zasady:
- Ten sam głos co w scenariuszu: pierwsza osoba, forma żeńska, naturalnie.
- content: sam tekst do powiedzenia do kamery, z mocnym pierwszym zdaniem (hook).
  Zwykłe akapity, bez nagłówków, bez emoji, bez opisów ujęć, bez hashtagów i bez wskazówek w nawiasach.
- title: zostaw, chyba że uwaga dotyczy tytułu albo zmienia temat (wtedy krótki, do 60 znaków, bez kropki).
- Nie wymyślaj marek, cen ani współprac, których nie ma w scenariuszu ani w uwagach.
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
