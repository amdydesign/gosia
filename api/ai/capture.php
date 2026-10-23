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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

const CAPTURE_KINDS = ['idea', 'task', 'purchase', 'collaboration'];

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

function capturePrompt($today, $weekday)
{
    return <<<PROMPT
Jesteś asystentem stylistki i influencerki. Dostajesz krótką notatkę wpisaną w pośpiechu (często bez polskich znaków, z literówkami).
Dzisiaj jest {$today} ({$weekday}). Zdecyduj, czym jest notatka, i zwróć dane w podanym schemacie JSON.

Rodzaje (kind):
- "idea" - pomysł na rolkę / post / nagranie (np. "rolka o płaszczach camel", "nagrać haul jesienny").
- "collaboration" - PŁATNA współpraca z marką: w notatce jest kwota albo wprost mowa o wynagrodzeniu / fakturze / umowie
  (np. "Vichy 2 stories 3000", "Pandora chce karuzelę za 4500 brutto", "umowa z Reserved na rolkę 5k").
  Bez kwoty i bez mowy o zapłacie to NIE jest współpraca.
- "purchase" - kupiona rzecz, którą może trzeba będzie zwrócić (np. "kupiłam płaszcz w Zalando 599", "zamówienie Answear buty").
- "task" - każda inna rzecz do zrobienia (np. "zadzwonić do księgowej", "wysłać fakturę do Mohito w piątek").
  Także treści dla marek bez zapłaty: podziękowanie za paczkę PR, barter, oznaczenie marki
  (np. "Stories za Esotiq x Ewa Minge" -> task "Nagraj stories dla Esotiq x Ewa Minge",
  "oznaczyć Answear w poście" -> task "Oznacz Answear w poście").
- W razie wątpliwości wybierz "task".

Zasady:
- title: krótki, konkretny tytuł po polsku, z wielkiej litery, bez kropki na końcu (dla zadania zacznij od czasownika, np. "Zadzwoń do księgowej").
- due_date: tylko dla "task", gdy w notatce jest termin ("jutro", "w piątek", "do 30.10") - jako YYYY-MM-DD; inaczej pusty tekst.
- idea.content: dla "idea" - rozwinięcie notatki w 1-3 zdaniach, jeśli jest z czego; inaczej pusty tekst.
- collaboration: brand, amount_gross (kwota brutto w zł, 0 gdy brak), notes (co trzeba zrobić).
- purchase: store (sklep), item (rzecz), amount (zł, 0 gdy brak).
- Zawsze zwracaj wszystkie pola; obiekty, które nie pasują do rodzaju, wypełnij pustymi tekstami i zerami.
- Nie wymyślaj kwot ani marek, których nie ma w notatce.
PROMPT;
}

function captureSchema()
{
    return [
        'type' => 'object',
        'properties' => [
            'kind' => ['type' => 'string', 'enum' => CAPTURE_KINDS],
            'title' => ['type' => 'string'],
            'due_date' => ['type' => 'string'],
            'idea' => [
                'type' => 'object',
                'properties' => ['content' => ['type' => 'string']],
                'required' => ['content'],
                'additionalProperties' => false,
            ],
            'collaboration' => [
                'type' => 'object',
                'properties' => [
                    'brand' => ['type' => 'string'],
                    'amount_gross' => ['type' => 'number'],
                    'notes' => ['type' => 'string'],
                ],
                'required' => ['brand', 'amount_gross', 'notes'],
                'additionalProperties' => false,
            ],
            'purchase' => [
                'type' => 'object',
                'properties' => [
                    'store' => ['type' => 'string'],
                    'item' => ['type' => 'string'],
                    'amount' => ['type' => 'number'],
                ],
                'required' => ['store', 'item', 'amount'],
                'additionalProperties' => false,
            ],
        ],
        'required' => ['kind', 'title', 'due_date', 'idea', 'collaboration', 'purchase'],
        'additionalProperties' => false,
    ];
}

function normalizeCapture($r, $text)
{
    $kind = in_array($r['kind'] ?? '', CAPTURE_KINDS, true) ? $r['kind'] : 'task';
    $title = trim((string) ($r['title'] ?? '')) ?: mb_substr($text, 0, 120);
    $due = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($r['due_date'] ?? '')) ? $r['due_date'] : null;

    // A "collaboration" without any money is a thank-you / barter post - keep it as a to-do
    if ($kind === 'collaboration' && (float) ($r['collaboration']['amount_gross'] ?? 0) <= 0) {
        $kind = 'task';
    }

    $out = ['kind' => $kind, 'title' => mb_substr($title, 0, 200), 'due_date' => $due];
    if ($kind === 'idea') {
        $out['idea'] = ['content' => trim((string) ($r['idea']['content'] ?? ''))];
    }
    if ($kind === 'collaboration') {
        $c = $r['collaboration'] ?? [];
        $out['collaboration'] = [
            'brand' => trim((string) ($c['brand'] ?? '')),
            'amount_gross' => max(0, (float) ($c['amount_gross'] ?? 0)),
            'notes' => trim((string) ($c['notes'] ?? '')),
        ];
    }
    if ($kind === 'purchase') {
        $p = $r['purchase'] ?? [];
        $out['purchase'] = [
            'store' => trim((string) ($p['store'] ?? '')),
            'item' => trim((string) ($p['item'] ?? '')),
            'amount' => max(0, (float) ($p['amount'] ?? 0)),
        ];
    }
    return $out;
}
