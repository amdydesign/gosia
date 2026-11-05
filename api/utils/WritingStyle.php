<?php
/**
 * Her writing voice: rules against "AI-sounding" text + style notes she gave the assistant
 * ("nie używam słowa stylówka"). Shared by the assistant and the reel generator.
 * Notes live in app_settings (name assistant_style_notes, JSON list).
 */

require_once __DIR__ . '/../config/Schema.php';

const STYLE_NOTES_MAX = 40;

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
