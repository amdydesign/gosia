<?php
/**
 * Her writing voice: rules against "AI-sounding" text + style notes she gave the assistant
 * ("nie używam słowa stylówka"). Shared by the assistant and the reel generator.
 * Notes live in app_settings (name assistant_style_notes, JSON list).
 */

require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/AiClient.php';
require_once __DIR__ . '/ReelPrompts.php';

const STYLE_NOTES_MAX = 40;
// Style profile: made once from her scripts, kept in app_settings, made again only when the
// scripts changed and the profile is a week old (or she asks) - saves reading every script each chat
const STYLE_PROFILE_MAX_AGE = 7 * 86400;
const STYLE_PROFILE_MODEL = 'claude-sonnet-5-5';
const STYLE_PROFILE_FULL_EXAMPLES = 3;

function humanStyleRules()
{
    return <<<RULES
Jak pisać, żeby brzmiało jak Gosia, a nie jak AI:
- Pisz tak, jak ona mówi do kamery: potocznie, prosto, jej słowami z przykładów. Pierwsza osoba, forma żeńska.
- Mieszaj długość zdań. Dużo krótkich. Czasem jedno dłuższe, jak w normalnej rozmowie.
- Konkret zamiast ogólników: nazwa rzeczy, kolor, materiał, sytuacja z życia, liczba.
- Hook to konkretna sytuacja albo mocne zdanie - nie "Czy wiesz, że...?" i nie "Hej kochani!" (chyba że ona tak zaczyna).
- Koniec naturalny: jedno zdanie albo prosta zachęta, tak jak w jej rolkach - bez morału i podsumowania.
Nie używaj schematów, po których od razu widać AI:
- "to nie X, to Y", "nie chodzi o X, tylko o Y", "X? Y.";
- wyliczanek po trzy dla rytmu ("prosto, wygodnie i stylowo");
- serii pytań retorycznych, "Brzmi znajomo?", "Znasz to?";
- myślników w co drugim zdaniu - zwykle wystarczy kropka albo przecinek;
- nadętych i sprzedażowych słów: kluczowy, niezwykle, idealny, ponadczasowy, odkryj, zanurz się, przenieś na wyższy poziom, game changer, efekt wow, w dzisiejszych czasach, warto pamiętać, podsumowując, bez wątpienia (chyba że ona sama ich używa);
- wykrzykników co zdanie i emoji na siłę;
- zdań, które nic nie mówią ("Moda to sposób wyrażania siebie").
Na koniec przeczytaj tekst jak na głos. Każde zdanie, które brzmi jak z reklamy albo jak wygenerowane, napisz prościej.
RULES;
}

/** @return string[] her notes, oldest first */
function styleNotes(PDO $conn, $userId)
{
    Schema::ensure($conn, 'app_settings');
    $stmt = $conn->prepare("SELECT value FROM app_settings WHERE user_id = :user_id AND name = 'assistant_style_notes'");
    $stmt->execute(['user_id' => $userId]);
    $list = json_decode((string) $stmt->fetchColumn(), true);
    return is_array($list) ? array_values(array_filter($list, 'is_string')) : [];
}

function saveStyleNotes(PDO $conn, $userId, array $notes)
{
    Schema::ensure($conn, 'app_settings');
    $notes = array_slice(array_values(array_unique($notes)), -STYLE_NOTES_MAX);
    $conn->prepare("
        INSERT INTO app_settings (user_id, name, value) VALUES (:user_id, 'assistant_style_notes', :value)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
    ")->execute(['user_id' => $userId, 'value' => json_encode($notes, JSON_UNESCAPED_UNICODE)]);
}

/** Notes as prompt text ("" when none). */
function styleNotesText(PDO $conn, $userId)
{
    $notes = styleNotes($conn, $userId);
    return $notes ? "Uwagi Gosi do stylu (zawsze ich przestrzegaj, ostatnie są najważniejsze):\n- " . implode("\n- ", $notes) : '';
}

/**
 * Her style profile: [profile array|null, string $examplesText, bool $fresh, ?array $usage].
 * $examplesText = her best few scripts in full (a description alone imitates worse than examples).
 */
function styleProfile(PDO $conn, $userId, $refresh = false)
{
    [$allText, $rows] = reelExamples($conn, $userId);
    if (!$rows) {
        return [null, '', false, null];
    }
    $hash = hash('sha256', $allText);

    Schema::ensure($conn, 'app_settings');
    $stmt = $conn->prepare("SELECT value FROM app_settings WHERE user_id = :user_id AND name = 'assistant_style_profile'");
    $stmt->execute(['user_id' => $userId]);
    $saved = json_decode((string) $stmt->fetchColumn(), true);

    $stale = !is_array($saved) || empty($saved['profile'])
        || ($saved['hash'] !== $hash && time() - (int) ($saved['at'] ?? 0) > STYLE_PROFILE_MAX_AGE);
    $usage = null;
    $made = false;
    if ($refresh || $stale) {
        try {
            AiClient::$lastUsage = null;
            $profile = AiClient::writeIdeas(styleProfilePrompt(), [['text' => $allText]], styleProfileSchema(), [
                'model' => STYLE_PROFILE_MODEL,
                'effort' => 'medium',
                'max_tokens' => 6000,
                'timeout' => 120,
            ]);
            $usage = AiClient::$lastUsage;
            $saved = ['hash' => $hash, 'at' => time(), 'profile' => $profile];
            $conn->prepare("
                INSERT INTO app_settings (user_id, name, value) VALUES (:user_id, 'assistant_style_profile', :value)
                ON DUPLICATE KEY UPDATE value = VALUES(value)
            ")->execute(['user_id' => $userId, 'value' => json_encode($saved, JSON_UNESCAPED_UNICODE)]);
            $made = true;
        } catch (RuntimeException $e) {
            // no profile yet and it could not be made: the caller falls back to all scripts
            if (!is_array($saved) || empty($saved['profile'])) {
                return [null, $allText, false, null];
            }
        }
    }

    $best = '';
    foreach (array_slice($rows, 0, STYLE_PROFILE_FULL_EXAMPLES) as $i => $e) {
        $views = $e['views'] !== null ? ' (' . number_format((int) $e['views'], 0, ',', ' ') . ' wyświetleń)' : '';
        $best .= '### ' . ($i + 1) . '. ' . $e['title'] . $views . "\n" . mb_substr(trim($e['content']), 0, 2500) . "\n\n";
    }
    return [$saved['profile'], $best, $made, $usage];
}

function styleProfileText(array $profile)
{
    $out = "Profil stylu Gosi (z jej scenariuszy):\n" . trim((string) ($profile['opis'] ?? ''));
    foreach (['typowe_zwroty' => 'Jej typowe zwroty', 'poczatki' => 'Tak zaczyna', 'zakonczenia' => 'Tak kończy', 'czego_nie_robi' => 'Tego u niej nie ma'] as $key => $label) {
        $list = array_filter(array_map('strval', (array) ($profile[$key] ?? [])));
        if ($list) {
            $out .= "\n\n{$label}:\n- " . implode("\n- ", $list);
        }
    }
    return $out;
}

function styleProfilePrompt()
{
    return <<<PROMPT
Powyżej są scenariusze rolek stylistki i influencerki modowej (Gosi) - najpierw te z największą liczbą wyświetleń.
Opisz jej styl tak, żeby ktoś inny mógł pisać dokładnie jej głosem, i żeby tekst nie brzmiał jak AI.
- opis: 8-12 krótkich punktów (po polsku): ton, długość zdań i całych rolek, słownictwo, jak zwraca się do widzów, humor, jak tłumaczy, rytm, typowa budowa rolki. Konkretnie, na podstawie tekstów - bez ogólników.
- typowe_zwroty: do 15 słów i zwrotów, których naprawdę używa (dosłownie z tekstów).
- poczatki: do 6 pierwszych zdań z jej rolek, które dobrze pokazują, jak zaczyna (dosłownie).
- zakonczenia: do 4 ostatnich zdań z jej rolek (dosłownie).
- czego_nie_robi: do 8 rzeczy, których w jej tekstach nie ma (np. emoji, angielskie wtrącenia, wykrzykniki, długie wstępy).
PROMPT;
}

function styleProfileSchema()
{
    $list = ['type' => 'array', 'items' => ['type' => 'string']];
    return [
        'type' => 'object',
        'properties' => [
            'opis' => ['type' => 'string'],
            'typowe_zwroty' => $list,
            'poczatki' => $list,
            'zakonczenia' => $list,
            'czego_nie_robi' => $list,
        ],
        'required' => ['opis', 'typowe_zwroty', 'poczatki', 'zakonczenia', 'czego_nie_robi'],
        'additionalProperties' => false,
    ];
}
