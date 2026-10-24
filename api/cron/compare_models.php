<?php
/**
 * Model test for "Generator rolek" (CLI only): the same prompts the app sends,
 * on Gosia's real scripts, run on several Claude models side by side.
 *
 *   php84 api/cron/compare_models.php
 *   php84 api/cron/compare_models.php --topic="Jak nosić szary płaszcz"
 *   php84 api/cron/compare_models.php --models=claude-sonnet-5-5,claude-opus-5-5
 *
 * Prints for each model: time, tokens, cost, the 3 topics, and the script for one
 * shared topic (yours, or the first one Sonnet suggested), so they can be compared.
 * Nothing is saved. A full run costs well under 1 USD.
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../utils/ReelPrompts.php';

// USD per 1M tokens: input, output
const MODEL_PRICES = [
    'claude-haiku-5-5' => [0.10, 0.50],
    'claude-sonnet-5-5' => [2.00, 10.00],
    'claude-opus-5-5' => [4.00, 20.00],
    'claude-fable-5-1' => [10.00, 50.00],
];

$opts = getopt('', ['topic::', 'models::', 'user::']);
$models = isset($opts['models']) ? array_filter(array_map('trim', explode(',', $opts['models']))) : array_keys(MODEL_PRICES);

$db = new Database();
$conn = $db->getConnection();

// Whose scripts: the user with the most written ones (Gosia), unless --user is given
$userId = isset($opts['user']) ? (int) $opts['user'] : (int) $conn->query("
    SELECT user_id FROM ideas WHERE content IS NOT NULL AND TRIM(content) <> ''
    GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1
")->fetchColumn();
if (!$userId) {
    exit("Brak pomysłów ze scenariuszem - nie ma na czym testować.\n");
}

$settings = AiSettings::load($conn, $userId);
AiClient::configure(['provider' => 'claude'] + $settings);
if (AiClient::key('claude') === '') {
    exit("Brak klucza Claude (Ustawienia -> Czytanie screenów albo ANTHROPIC_API_KEY w api/.env).\n");
}

[$examplesText, $examples] = reelExamples($conn, $userId);
$today = date('Y-m-d');
echo "Test generatora rolek - {$today}, scenariuszy na wejściu: " . count($examples) . "\n";

// ---------- Step 1: topics ----------
$results = [];
$topicsText = $examplesText . reelTakenTopics($conn, $userId);
foreach ($models as $model) {
    $results[$model] = ['topics' => run($model, topicsPrompt($today), $topicsText, topicsSchema(), REELS_TOPICS_OPTIONS)];
}

line('KROK 1: 3 TEMATY');
foreach ($models as $model) {
    $r = $results[$model]['topics'];
    echo "\n## {$model}  " . stats($r) . "\n";
    if (isset($r['error'])) {
        echo "   BŁĄD: {$r['error']}\n";
        continue;
    }
    foreach ($r['data']['topics'] ?? [] as $i => $t) {
        echo '   ' . ($i + 1) . ". {$t['title']}\n      {$t['pitch']}" . ($t['based_on'] ? "  [na bazie: {$t['based_on']}]" : '') . "\n";
    }
}

$topic = trim($opts['topic'] ?? '');
$pitch = '';
if ($topic === '') {
    foreach (array_merge(['claude-sonnet-5-5'], $models) as $model) {
        $first = $results[$model]['topics']['data']['topics'][0] ?? null;
        if ($first) {
            $topic = $first['title'];
            $pitch = $first['pitch'] ?? '';
            break;
        }
    }
}
if ($topic === '') {
    exit("\nŻaden model nie zwrócił tematów - błędy są powyżej.\n");
}

// ---------- Step 2: one shared topic -> script ----------
$scriptText = $examplesText . 'Temat nowej rolki: ' . $topic . ($pitch !== '' ? "\nO czym: " . $pitch : '');
foreach ($models as $model) {
    $results[$model]['script'] = run($model, scriptPrompt($today, (bool) $examples), $scriptText, scriptSchema(), []);
}

// ---------- Report ----------
line("KROK 2: SCENARIUSZ NA TEN SAM TEMAT: {$topic}");
foreach ($models as $model) {
    $r = $results[$model]['script'];
    echo "\n## {$model}  " . stats($r) . "\n";
    if (isset($r['error'])) {
        echo "   BŁĄD: {$r['error']}\n";
        continue;
    }
    $content = $r['data']['content'] ?? '';
    $words = count(preg_split('/\s+/u', trim($content), -1, PREG_SPLIT_NO_EMPTY));
    echo "   Tytuł: " . ($r['data']['title'] ?? '') . "  ({$words} słów, ~" . round($words / 2.3) . " s)\n\n";
    echo '   ' . str_replace("\n", "\n   ", wordwrap($content, 100)) . "\n";
}

line('PODSUMOWANIE (oba kroki razem)');
printf("%-20s %10s %10s %12s\n", 'model', 'czas', 'tokeny wy', 'koszt USD');
foreach ($models as $model) {
    $time = $cost = 0;
    $out = 0;
    foreach (['topics', 'script'] as $step) {
        $time += $results[$model][$step]['time'] ?? 0;
        $cost += $results[$model][$step]['cost'] ?? 0;
        $out += $results[$model][$step]['usage']['output_tokens'] ?? 0;
    }
    printf("%-20s %9.1fs %10d %12.4f\n", $model, $time, $out, $cost);
}
echo "\nWklej ten wynik do rozmowy - ocenię, który model pisze najlepiej.\n";

// ---------------------------------------------------------------- helpers

function run($model, $prompt, $text, array $schema, array $options)
{
    $start = microtime(true);
    try {
        AiClient::$lastUsage = null;
        $data = AiClient::writeIdeas($prompt, $text, $schema, ['model' => $model] + $options);
        $usage = AiClient::$lastUsage ?? [];
        [$in, $out] = MODEL_PRICES[$model] ?? [0, 0];
        $inputTokens = ($usage['input_tokens'] ?? 0) + ($usage['cache_read_input_tokens'] ?? 0) + ($usage['cache_creation_input_tokens'] ?? 0);
        return [
            'data' => $data,
            'usage' => $usage,
            'time' => microtime(true) - $start,
            'cost' => ($inputTokens * $in + ($usage['output_tokens'] ?? 0) * $out) / 1e6,
        ];
    } catch (Exception $e) {
        return ['error' => $e->getMessage(), 'time' => microtime(true) - $start, 'cost' => 0];
    }
}

function stats(array $r)
{
    $u = $r['usage'] ?? [];
    $served = isset($u['model']) && isset($r['data']) ? ' (odpowiedział: ' . $u['model'] . ')' : '';
    return sprintf('%.1fs, wej. %d / wyj. %d tokenów, %.4f USD', $r['time'], $u['input_tokens'] ?? 0, $u['output_tokens'] ?? 0, $r['cost']) . $served;
}

function line($title)
{
    echo "\n" . str_repeat('=', 100) . "\n{$title}\n" . str_repeat('=', 100) . "\n";
}
