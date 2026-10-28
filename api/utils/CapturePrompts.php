<?php
/**
 * "Zrzuć tutaj": sorting a quick note (api/ai/capture.php) or a shared screen
 * (api/inbox/upload.php) into idea / task / purchase / collaboration.
 */

const CAPTURE_KINDS = ['idea', 'task', 'purchase', 'collaboration'];

function capturePrompt($today, $weekday, $time = null)
{
    $time = $time ?: date('H:i');
    return <<<PROMPT
Jesteś asystentem stylistki i influencerki. Dostajesz krótką notatkę wpisaną w pośpiechu (często bez polskich znaków, z literówkami).
Dzisiaj jest {$today} ({$weekday}), teraz jest godzina {$time}. Zdecyduj, czym jest notatka, i zwróć dane w podanym schemacie JSON.

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
- remind_at: tylko dla "task", gdy w notatce jest godzina albo prośba o przypomnienie ("o 19:00", "o 15", "za godzinę", "jutro o 9")
  - jako "YYYY-MM-DD HH:MM"; inaczej pusty tekst. Sama godzina bez dnia = dziś, a jeśli ta godzina już minęła - jutro.
  "Wieczorem" = 19:00, "rano" = 9:00. Ustaw wtedy też due_date na ten sam dzień.
- Notatka typu "przypomnij mi o X" / "o 19 przypomnij o powerbanku" to "task" z tytułem "Przypomnienie o X"
  (X w poprawnej formie, np. "Przypomnienie o powerbanku", "Przypomnienie o telefonie do mamy"), bez godziny w tytule.
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
            'remind_at' => ['type' => 'string'],
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
        'required' => ['kind', 'title', 'due_date', 'remind_at', 'idea', 'collaboration', 'purchase'],
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

    $remindAt = $kind === 'task' ? captureRemindAt($r['remind_at'] ?? '') : null;
    if ($remindAt) {
        $due = substr($remindAt, 0, 10);
    }

    $out = ['kind' => $kind, 'title' => mb_substr($title, 0, 200), 'due_date' => $due, 'remind_at' => $remindAt];
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

/** "YYYY-MM-DD HH:MM" in the future, or null. A time that already passed today means tomorrow. */
function captureRemindAt($value)
{
    $at = DateTime::createFromFormat('Y-m-d H:i', trim((string) $value));
    if (!$at) {
        return null;
    }
    $now = new DateTime();
    if ($at <= $now && $at->format('Y-m-d') === $now->format('Y-m-d')) {
        $at->modify('+1 day');
    }
    return $at > $now ? $at->format('Y-m-d H:i') : null;
}
