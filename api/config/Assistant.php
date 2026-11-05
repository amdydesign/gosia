<?php
/**
 * "Asystent" - a chat with Claude that knows Gosia's work and can read her panel.
 *
 * One reply = a loop of streamed Messages API calls: Claude may call the panel tools
 * (AssistantTools) or web search, we run the tools and continue until it answers.
 * Text is forwarded to the app as it arrives (Server-Sent Events).
 *
 * Every API message is stored exactly as sent / received and replayed unchanged on the
 * next turn - newer models bind their thinking blocks to the conversation, so history
 * is append-only (nothing trimmed, nothing edited). The system prompt never changes;
 * the current date and time ride along with each of her messages instead.
 *
 * Plain curl, like AiClient (no SDK on the shared hosting).
 */

require_once __DIR__ . '/AiClient.php';
require_once __DIR__ . '/Schema.php';
require_once __DIR__ . '/../utils/AssistantTools.php';

class Assistant
{
    const URL = 'https://api.anthropic.com/v1/messages';
    const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
    // lets a thinking block that no longer matches its conversation be dropped instead of failing the request
    const BINDING_BETA = 'thinking-binding-controls-2026-08-01';
    // Sonnet: good enough for everyday chat at half of Opus's price - Opus stays one tap away
    const DEFAULT_MODEL = 'claude-sonnet-5-5';
    const MAX_TOKENS = 64000;
    const MAX_STEPS = 16;

    /**
     * Version of the system prompt + tool set a chat was started with. Newer models bind their
     * thinking to that prefix, so a chat keeps its version for good; only new chats get the latest.
     * 1: first release. 2: research - web pages read in full, more searches, sources required.
     */
    const PROMPT_VERSION = 2;
    const MAX_HISTORY_BYTES = 6000000;

    /**
     * Models she can switch between. effort: chat answers stay quick on the smaller ones.
     * web: web search tool version the model supports. fallbacks: server-side refusal fallback.
     */
    const MODELS = [
        'claude-haiku-5-5' => [
            'label' => 'Haiku 5.5',
            'hint' => 'Najszybszy i najtańszy — proste pytania',
            'effort' => 'low',
            'web' => 'web_search_20250305',
            'fetch' => 'web_fetch_20250910',
            'fallbacks' => false,
        ],
        'claude-sonnet-5-5' => [
            'label' => 'Sonnet 5.5',
            'hint' => 'Szybki i bystry — na co dzień',
            'effort' => 'low',
            'web' => 'web_search_20260209',
            'fetch' => 'web_fetch_20260209',
            'fallbacks' => true,
        ],
        'claude-opus-5-5' => [
            'label' => 'Opus 5.5',
            'hint' => 'Najlepszy do trudnych spraw, ok. 2× droższy',
            'effort' => 'medium',
            'web' => 'web_search_20260209',
            'fetch' => 'web_fetch_20260209',
            'fallbacks' => true,
        ],
    ];

    /**
     * USD per million tokens: input, output, cache read (5-minute cache writes cost 1.25x input).
     * Includes the models a refusal may fall back to. 'long' = price above 100K prompt tokens.
     */
    const PRICES = [
        'claude-haiku-5-5' => ['in' => 0.10, 'out' => 0.50, 'read' => 0.01, 'long' => ['in' => 0.50, 'out' => 2.50, 'read' => 0.05]],
        'claude-sonnet-5-5' => ['in' => 2.00, 'out' => 10.00, 'read' => 0.20],
        'claude-opus-5-5' => ['in' => 4.00, 'out' => 20.00, 'read' => 0.20],
        'claude-sonnet-5' => ['in' => 2.00, 'out' => 10.00, 'read' => 0.20],
        'claude-opus-5' => ['in' => 5.00, 'out' => 25.00, 'read' => 0.50],
        'claude-opus-4-8' => ['in' => 5.00, 'out' => 25.00, 'read' => 0.50],
        'claude-fable-5-1' => ['in' => 10.00, 'out' => 50.00, 'read' => 0.25],
    ];
    const WEB_SEARCH_USD = 0.01; // $10 per 1000 searches

    /** Dollars to złoty for the app (approximate; ASSISTANT_USD_PLN in api/.env overrides). */
    public static function usdToPln()
    {
        $rate = (float) str_replace(',', '.', (string) ($_ENV['ASSISTANT_USD_PLN'] ?? ''));
        return $rate > 0 ? $rate : 3.70;
    }

    /**
     * Cost in USD of one API response from its usage. After a refusal fallback usage.iterations
     * lists every attempt (each billed at its own model's price) - those are summed instead.
     */
    public static function cost($model, $usage)
    {
        $usage = json_decode(json_encode($usage), true);
        if (!is_array($usage)) {
            return 0.0;
        }
        $iterations = isset($usage['iterations']) && is_array($usage['iterations']) ? $usage['iterations'] : [];
        $parts = count($iterations) > 1 ? $iterations : [$usage];
        $total = 0.0;
        foreach ($parts as $part) {
            if (!is_array($part)) {
                continue;
            }
            $price = self::PRICES[$part['model'] ?? $model] ?? (self::PRICES[$model] ?? self::PRICES[self::DEFAULT_MODEL]);
            $in = (int) ($part['input_tokens'] ?? 0);
            $write = (int) ($part['cache_creation_input_tokens'] ?? 0);
            $read = (int) ($part['cache_read_input_tokens'] ?? 0);
            $out = (int) ($part['output_tokens'] ?? 0);
            if (isset($price['long']) && $in + $write + $read > 100000) {
                $price = $price['long'];
            }
            $total += ($in * $price['in'] + $write * $price['in'] * 1.25 + $read * $price['read'] + $out * $price['out']) / 1000000;
        }
        $searches = (int) ($usage['server_tool_use']['web_search_requests'] ?? 0);
        return round($total + $searches * self::WEB_SEARCH_USD, 6);
    }

    public static function models()
    {
        $out = [];
        foreach (self::MODELS as $id => $m) {
            $out[] = ['id' => $id, 'label' => $m['label'], 'hint' => $m['hint']];
        }
        return $out;
    }

    public static function modelId($value)
    {
        return isset(self::MODELS[$value]) ? $value : self::DEFAULT_MODEL;
    }

    public static function modelLabel($id)
    {
        return self::MODELS[$id]['label'] ?? $id;
    }

    public static function promptVersion($value)
    {
        $value = (int) $value;
        return $value >= 1 && $value <= self::PROMPT_VERSION ? $value : 1;
    }

    /** Frozen system prompt of a version - never edit a released one, add a new version instead. */
    public static function systemPrompt($version = self::PROMPT_VERSION)
    {
        return $version >= 2 ? self::basePrompt() . "\n\n" . self::researchPrompt() : self::basePrompt();
    }

    private static function researchPrompt()
    {
        return <<<PROMPT
Research w internecie (trendy, marki, ceny, rynek, statystyki, konkurencja, wydarzenia, przepisy, regulaminy sklepów):
- Szukaj w internecie zawsze, gdy odpowiedź zależy od faktów ze świata - nie odpowiadaj z pamięci. Twoja wiedza może być nieaktualna.
- Sprawdź kilka niezależnych źródeł. Ważne strony otwieraj narzędziem web_fetch i czytaj w całości, a nie tylko fragment z wyszukiwarki. Linki, które Gosia wkleja, też otwieraj.
- Wybieraj źródła pierwotne i wiarygodne: strona marki lub sklepu, oficjalny raport, dane GUS/Eurostatu, urzędy, renomowane media branżowe. Fora i blogi traktuj jako opinie i tak je nazywaj.
- Każda liczba, data, cena i cytat z internetu musi mieć źródło. Przy liczbach podaj, z kiedy są dane.
- Jeśli źródła mówią co innego albo czegoś nie da się znaleźć - napisz to wprost. Nigdy nie zmyślaj faktów, liczb ani linków.
- Research kończ krótką listą "Źródła:" - tytuł strony jako link w formacie [tytuł](adres), tylko strony, z których naprawdę korzystałeś.
- Przy dłuższym researchu zacznij od 2-3 zdań z najważniejszymi wnioskami, potem szczegóły.
PROMPT;
    }

    private static function basePrompt()
    {
        return <<<PROMPT
Jesteś osobistym asystentem Gosi (Małgorzata Mordarska) - stylistki i influencerki modowej. Działasz w jej panelu "Gonia", w którym prowadzi swoją pracę.

Jej praca:
- Współprace z markami: posty i rolki na Instagramie/TikToku, stories, sesje, konsultacje stylizacyjne, eventy. Briefy, umowy, terminy publikacji, rozliczenia (umowa o dzieło/zlecenie, faktura, Useme, gotówka) i pilnowanie przelewów.
- Zakupy ubrań do stylizacji i sesji - większość wraca do sklepów, więc pilnuje terminów zwrotów i tego, czy pieniądze wróciły.
- Pomysły i scenariusze rolek, nagrywanie (prompter), wyniki publikacji.
- Dokumenty i umowy (poufne).

Masz narzędzia do jej panelu: plan_dnia, wspolprace, zarobki, zakupy, pomysly, dokumenty, dodaj_zadanie - oraz wyszukiwanie w internecie.
- Pytania o jej sprawy (terminy, pieniądze, zwroty, marki, umowy) sprawdzaj narzędziami. Nigdy nie zgaduj liczb, dat ani kwot - jeśli czegoś nie ma w danych, powiedz to wprost.
- Do sumowania zarobków używaj narzędzia zarobki, nie licz w pamięci.
- Gdy prosi, żeby coś zapamiętać, przypomnieć albo zapisać na później - dodaj zadanie (dodaj_zadanie) i potwierdź jednym zdaniem. Godzinę przypomnienia ustaw tylko, gdy ją poda.
- Internet: trendy, sklepy, regulaminy zwrotów, informacje o markach, wydarzenia. Podawaj źródło.

Gosia ma ADHD. Pisz tak, żeby dało się to ogarnąć od razu:
- Najpierw odpowiedź, potem ewentualnie szczegóły. Najważniejsze (kwota, termin, ile dni) **pogrub**.
- Krótko: kilka zdań albo lista do ~5 punktów. Bez wstępów, powtarzania pytania i podsumowań na końcu.
- Gdy jest kilka rzeczy do zrobienia - ułóż je od najpilniejszej i wskaż jedną, od której zacząć.
- Pytaj tylko, gdy naprawdę musisz, i wtedy jednym krótkim pytaniem. Jeśli da się rozsądnie zgadnąć - zgadnij i powiedz, co założyłeś.
- Terminy podawaj jako dzień + ile zostało, np. "piątek 7.11 (za 2 dni)". Kwoty: "3 000 zł".
- Formatowanie: zwykły tekst, **pogrubienie**, listy z "- " lub "1.". Bez tabel i bez dużych nagłówków.

Gdy prosi o tekst (mail lub wiadomość do marki, opis posta, caption, odpowiedź na komentarz, scenariusz) - napisz gotowy do skopiowania, naturalnie, jej głosem: ciepło, konkretnie, bez korpo-języka i bez nadmiaru emoji. Po polsku, chyba że poprosi o inny język. Sam tekst daj bez komentarza przed i po, chyba że trzeba coś uzupełnić - wtedy jedno zdanie.

O podatkach i umowach mów ogólnie i praktycznie; przy ważnych decyzjach zaznacz krótko, żeby potwierdziła z księgową.
Odpowiadaj zawsze po polsku (chyba że Gosia pisze w innym języku). Mów do niej po imieniu, na "ty".
PROMPT;
    }

    /** "<kontekst>" block sent with each of her messages (date and time change, the prompt does not). */
    public static function contextText()
    {
        $days = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
        $months = ['', 'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
        $now = time();
        return sprintf(
            '<kontekst>Teraz: %s, %d %s %s, godz. %s (%s).</kontekst>',
            $days[(int) date('w', $now)],
            (int) date('j', $now),
            $months[(int) date('n', $now)],
            date('Y', $now),
            date('H:i', $now),
            date('Y-m-d', $now)
        );
    }

    public static function isContextBlock($block)
    {
        return is_object($block) && ($block->type ?? '') === 'text' && strpos((string) ($block->text ?? ''), '<kontekst>') === 0;
    }

    // ---------------------------------------------------------------- one reply

    /**
     * Run one assistant reply on top of $history (API messages, objects) ending with her message.
     *
     * @param callable $emit fn(string $event, array $data) - forwards progress to the app
     * @return array ['messages' => [['kind' => ..., 'message' => object]], 'model' => served model]
     * @throws RuntimeException with a Polish message
     */
    public static function reply(PDO $conn, $userId, array $history, $model, callable $emit, $version = self::PROMPT_VERSION)
    {
        $key = AiClient::key('claude');
        if ($key === '') {
            throw new RuntimeException('Asystent wymaga klucza Claude (Ustawienia → Czytanie screenów).');
        }
        $model = self::modelId($model);
        $version = self::promptVersion($version);
        $options = ['version' => $version, 'web' => true, 'fetch' => $version >= 2, 'fallbacks' => self::MODELS[$model]['fallbacks'], 'eager' => true, 'autocache' => true, 'binding' => true];

        $messages = $history;
        $new = [];
        $served = $model;
        $needBreak = false;
        $hasText = false;
        $totalCost = 0.0;

        for ($step = 0; $step < self::MAX_STEPS; $step++) {
            $last = $step === self::MAX_STEPS - 1;
            $result = self::stream($key, $model, $messages, $options, $last, function ($event, $data) use ($emit, &$needBreak, &$hasText) {
                if ($event === 'text') {
                    if ($needBreak && $hasText) {
                        $data['text'] = "\n\n" . $data['text'];
                    }
                    $needBreak = false;
                    $hasText = true;
                } elseif ($event === 'tool') {
                    $needBreak = true;
                }
                $emit($event, $data);
            });

            $served = $result['model'] ?: $served;
            $message = (object) ['role' => 'assistant', 'content' => self::forReplay($result['content'])];
            $stop = $result['stop_reason'];

            if ($stop === 'refusal') {
                throw new RuntimeException('Model nie odpowie na to pytanie. Spróbuj sformułować je inaczej albo przełącz model.');
            }

            $cost = self::cost($served, $result['usage']);
            $totalCost += $cost;
            $messages[] = $message;
            $new[] = ['kind' => 'assistant', 'message' => $message, 'model' => $served, 'cost' => $cost, 'usage' => $result['usage']];

            if ($stop === 'pause_turn') {
                // a long web search paused - send it back as is and let it carry on
                continue;
            }
            if ($stop !== 'tool_use') {
                break;
            }

            $results = [];
            $toolCost = 0.0;
            foreach ($message->content as $block) {
                if (($block->type ?? '') !== 'tool_use') {
                    continue;
                }
                $events = [];
                $input = isset($result['invalid'][$block->id]) ? null : json_decode(json_encode($block->input ?? new stdClass()), true);
                [$output, $isError] = AssistantTools::run($conn, $userId, $block->name, $input, $events);
                foreach ($events as $event) {
                    if ($event['type'] === 'cost') {
                        // a tool that called the API itself (style profile) - its price counts for this reply
                        $toolCost += self::cost($event['model'], $event['usage']);
                        continue;
                    }
                    $emit($event['type'], $event);
                }
                $item = (object) ['type' => 'tool_result', 'tool_use_id' => $block->id, 'content' => $output];
                if ($isError) {
                    $item->is_error = true;
                }
                $results[] = $item;
            }
            $toolMessage = (object) ['role' => 'user', 'content' => $results];
            $messages[] = $toolMessage;
            $new[] = ['kind' => 'tool', 'message' => $toolMessage, 'model' => null, 'cost' => $toolCost > 0 ? round($toolCost, 6) : null];
            $totalCost += $toolCost;
        }

        return ['messages' => $new, 'model' => $served, 'cost' => round($totalCost, 6)];
    }

    /**
     * After a mid-answer fallback the declined part may hold blocks the next model cannot take:
     * before the last "fallback" marker keep only text and finished server-tool pairs.
     */
    public static function forReplay(array $content)
    {
        $boundary = null;
        foreach ($content as $i => $block) {
            if (($block->type ?? '') === 'fallback') {
                $boundary = $i;
            }
        }
        if ($boundary === null) {
            return $content;
        }
        $resultIds = [];
        foreach ($content as $block) {
            if (isset($block->tool_use_id) && substr((string) ($block->type ?? ''), -12) === '_tool_result') {
                $resultIds[$block->tool_use_id] = true;
            }
        }
        $out = [];
        foreach ($content as $i => $block) {
            $type = $block->type ?? '';
            if ($i > $boundary) {
                $out[] = $block;
                continue;
            }
            if ($type === 'text' && trim((string) ($block->text ?? '')) !== '') {
                $out[] = $block;
            } elseif ($type === 'server_tool_use' && isset($resultIds[$block->id ?? ''])) {
                $out[] = $block;
            } elseif (substr($type, -12) === '_tool_result' && $type !== 'tool_result') {
                $out[] = $block;
            }
        }
        return $out;
    }

    // ---------------------------------------------------------------- streaming

    public static function buildBody($model, array $messages, array $options, $noTools = false)
    {
        $config = self::MODELS[$model];
        $tools = AssistantTools::definitions();
        if (empty($options['eager'])) {
            foreach ($tools as &$tool) {
                unset($tool['eager_input_streaming']);
            }
            unset($tool);
        }
        $version = self::promptVersion($options['version'] ?? 1);
        if (!empty($options['web'])) {
            $tools[] = ['type' => $config['web'], 'name' => 'web_search', 'max_uses' => $version >= 2 ? 10 : 5, 'user_location' => [
                'type' => 'approximate', 'country' => 'PL', 'timezone' => 'Europe/Warsaw',
            ]];
            // read whole pages (search results, links she pastes) - research needs more than snippets
            if (!empty($options['fetch'])) {
                $tools[] = ['type' => $config['fetch'], 'name' => 'web_fetch', 'max_uses' => 8, 'max_content_tokens' => 40000, 'citations' => ['enabled' => true]];
            }
        }
        // the frozen prefix (tools + system) gets its own cache point; the growing chat is cached automatically
        $body = [
            'model' => $model,
            'max_tokens' => self::MAX_TOKENS,
            'stream' => true,
            'system' => [['type' => 'text', 'text' => self::systemPrompt($version), 'cache_control' => ['type' => 'ephemeral']]],
            'tools' => $tools,
            'thinking' => ['type' => 'adaptive'],
            'output_config' => ['effort' => $config['effort']],
            'messages' => $messages,
        ];
        if (!empty($options['strip_empty'])) {
            // only after the API refused them: empty text blocks out of earlier replies
            foreach ($body['messages'] as $k => $message) {
                if (($message->role ?? '') === 'assistant' && is_array($message->content)) {
                    $body['messages'][$k] = (object) ['role' => 'assistant', 'content' => array_values(array_filter($message->content, function ($b) {
                        return ($b->type ?? '') !== 'text' || (string) ($b->text ?? '') !== '';
                    }))];
                }
            }
        }
        if (!empty($options['autocache'])) {
            $body['cache_control'] = ['type' => 'ephemeral'];
        }
        if (!empty($options['binding'])) {
            // safety net: a mismatched old thinking block is skipped, the chat keeps working
            $body['thinking']['block_binding'] = ['prefix_mismatch_behavior' => 'drop_block'];
        }
        if ($noTools) {
            // last step of a long loop: answer with what is known
            $body['tool_choice'] = ['type' => 'none'];
        }
        if (!empty($options['fallbacks'])) {
            $body['fallbacks'] = 'default';
        }
        return $body;
    }

    /**
     * One streamed API call. Optional features the API rejects (fallbacks, eager tool streaming,
     * web search version) are switched off and the call is retried - nothing has been shown yet then.
     *
     * @return array ['content' => blocks (objects), 'stop_reason' => ..., 'model' => ...]
     */
    private static function stream($key, $model, array $messages, array &$options, $noTools, callable $emit)
    {
        for ($attempt = 0; $attempt < 9; $attempt++) {
            $headers = ['Content-Type: application/json', 'x-api-key: ' . $key, 'anthropic-version: 2023-06-01'];
            $betas = [];
            if (!empty($options['fallbacks'])) {
                $betas[] = self::FALLBACK_BETA;
            }
            if (!empty($options['binding'])) {
                $betas[] = self::BINDING_BETA;
            }
            if ($betas) {
                $headers[] = 'anthropic-beta: ' . implode(',', $betas);
            }
            $body = json_encode(self::buildBody($model, $messages, $options, $noTools), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($body === false) {
                throw new RuntimeException('Nie udało się przygotować wiadomości.');
            }

            $parser = new AssistantStreamParser($emit);
            $status = 0;
            $errorBody = '';
            $ch = curl_init(self::URL);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_POSTFIELDS => $body,
                CURLOPT_CONNECTTIMEOUT => 15,
                CURLOPT_TIMEOUT => 600,
                CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$status) {
                    if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                        $status = (int) $m[1];
                    }
                    return strlen($line);
                },
                CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$status, &$errorBody, $parser) {
                    if ($status === 200) {
                        $parser->feed($chunk);
                    } elseif (strlen($errorBody) < 20000) {
                        $errorBody .= $chunk;
                    }
                    return strlen($chunk);
                },
            ]);
            $ok = curl_exec($ch);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($status === 200) {
                if ($parser->error) {
                    throw new RuntimeException(self::streamErrorMessage($parser->error));
                }
                if ($ok === false && !$parser->finished) {
                    throw new RuntimeException('Połączenie z Claude się urwało. Spróbuj jeszcze raz.');
                }
                return $parser->result();
            }
            if ($ok === false && $status === 0) {
                throw new RuntimeException('Brak połączenia z Claude (' . $curlError . ').');
            }

            $error = json_decode($errorBody, true);
            $detail = (string) ($error['error']['message'] ?? '');
            if ($status === 400) {
                $lower = strtolower($detail);
                if (!empty($options['fallbacks']) && strpos($lower, 'fallback') !== false) {
                    $options['fallbacks'] = false;
                    continue;
                }
                if (empty($options['strip_empty']) && strpos($lower, 'non-empty') !== false) {
                    $options['strip_empty'] = true;
                    continue;
                }
                if (!empty($options['binding']) && (strpos($lower, 'block_binding') !== false || strpos($lower, 'thinking-binding') !== false)) {
                    $options['binding'] = false;
                    continue;
                }
                if (!empty($options['eager']) && strpos($lower, 'eager') !== false) {
                    $options['eager'] = false;
                    continue;
                }
                if (!empty($options['autocache']) && strpos($lower, 'cache_control') !== false) {
                    $options['autocache'] = false;
                    continue;
                }
                if (!empty($options['fetch']) && strpos($lower, 'web_fetch') !== false) {
                    $options['fetch'] = false;
                    continue;
                }
                if (!empty($options['web']) && (strpos($lower, 'web_search') !== false || strpos($lower, 'user_location') !== false)) {
                    $options['web'] = false;
                    continue;
                }
            }
            if (($status === 529 || $status >= 500) && $attempt < 2) {
                sleep(2);
                continue;
            }
            throw new RuntimeException(self::httpErrorMessage($status, $detail));
        }
        throw new RuntimeException('Claude nie przyjął wiadomości. Spróbuj jeszcze raz.');
    }

    private static function streamErrorMessage(array $error)
    {
        $type = $error['type'] ?? '';
        if ($type === 'overloaded_error') {
            return 'Claude jest teraz przeciążony. Spróbuj za chwilę albo przełącz model.';
        }
        if ($type === 'rate_limit_error') {
            return 'Limit zapytań do Claude wyczerpany. Spróbuj za chwilę.';
        }
        return 'Claude przerwał odpowiedź. Spróbuj jeszcze raz.';
    }

    private static function httpErrorMessage($status, $detail)
    {
        if ($status === 401 || $status === 403) {
            return 'Klucz Claude jest nieprawidłowy - sprawdź Ustawienia → Czytanie screenów.';
        }
        if ($status === 429) {
            return 'Limit zapytań do Claude wyczerpany. Spróbuj za chwilę.';
        }
        if ($status === 413) {
            return 'Rozmowa jest za duża. Zacznij nową albo wyślij mniej zdjęć.';
        }
        if ($status === 529 || $status >= 500) {
            return 'Claude jest chwilowo niedostępny. Spróbuj za chwilę albo przełącz model.';
        }
        return 'Błąd Claude (' . $status . ')' . ($detail !== '' ? ': ' . mb_substr($detail, 0, 200) : '');
    }

    // ---------------------------------------------------------------- display

    /**
     * Stored API messages -> chat bubbles for the app:
     * [{ id, role: user|assistant, text, images, sources: [{url, title}], model, created_at }]
     */
    public static function bubbles(array $rows)
    {
        $out = [];
        $current = null;
        $needBreak = false;
        foreach ($rows as $row) {
            $content = json_decode($row['content']);
            if (!is_array($content)) {
                continue;
            }
            if ($row['kind'] === 'user') {
                if ($current) {
                    $out[] = $current;
                    $current = null;
                }
                $text = '';
                $images = 0;
                foreach ($content as $block) {
                    if (($block->type ?? '') === 'image') {
                        $images++;
                    } elseif (($block->type ?? '') === 'text' && !self::isContextBlock($block)) {
                        $text = (string) $block->text;
                    }
                }
                $out[] = ['id' => (int) $row['id'], 'role' => 'user', 'text' => $text, 'images' => $images, 'created_at' => $row['created_at']];
                continue;
            }
            if ($row['kind'] === 'tool') {
                if ($current) {
                    $current['cost_usd'] = round($current['cost_usd'] + (float) ($row['cost_usd'] ?? 0), 6);
                }
                continue;
            }
            if ($row['kind'] !== 'assistant') {
                continue;
            }
            if (!$current) {
                $current = ['id' => (int) $row['id'], 'role' => 'assistant', 'text' => '', 'sources' => [], 'model' => $row['model'], 'cost_usd' => 0.0, 'created_at' => $row['created_at']];
                $needBreak = false;
            }
            $current['model'] = $row['model'] ?: $current['model'];
            $current['cost_usd'] = round($current['cost_usd'] + (float) ($row['cost_usd'] ?? 0), 6);
            foreach ($content as $block) {
                $type = $block->type ?? '';
                if ($type === 'text') {
                    $text = (string) ($block->text ?? '');
                    if ($text === '') {
                        continue;
                    }
                    if ($needBreak && $current['text'] !== '') {
                        $current['text'] .= "\n\n";
                    }
                    $needBreak = false;
                    $current['text'] .= $text;
                    foreach ($block->citations ?? [] as $citation) {
                        self::addSource($current['sources'], $citation);
                    }
                } elseif ($type === 'tool_use' || $type === 'server_tool_use') {
                    $needBreak = true;
                } elseif ($type === 'web_fetch_tool_result') {
                    self::addFetchedSource($current['sources'], $block);
                }
            }
        }
        if ($current) {
            $out[] = $current;
        }
        return $out;
    }

    /** A page the model opened with web_fetch (result block, object). */
    public static function addFetchedSource(array &$sources, $block)
    {
        $result = $block->content ?? null;
        if (!is_object($result) || empty($result->url)) {
            return;
        }
        $title = $result->content->title ?? ($result->title ?? '');
        self::addSource($sources, ['url' => $result->url, 'title' => $title]);
    }

    public static function addSource(array &$sources, $citation)
    {
        $url = is_object($citation) ? ($citation->url ?? '') : ($citation['url'] ?? '');
        if ($url === '' || count($sources) >= 15) {
            return;
        }
        foreach ($sources as $s) {
            if ($s['url'] === $url) {
                return;
            }
        }
        $title = is_object($citation) ? ($citation->title ?? '') : ($citation['title'] ?? '');
        $sources[] = ['url' => $url, 'title' => $title ?: parse_url($url, PHP_URL_HOST)];
    }
}

/**
 * Server-Sent Events from the Messages API -> content blocks (objects, exactly as the API
 * sent them) + app events: text deltas, "what I am doing" statuses, sources.
 */
class AssistantStreamParser
{
    public $finished = false;
    public $error = null;

    private $emit;
    private $buffer = '';
    private $blocks = [];
    private $json = [];
    private $stopReason = null;
    private $model = null;
    private $invalid = [];
    private $usage = [];

    public function __construct(callable $emit)
    {
        $this->emit = $emit;
    }

    public function feed($chunk)
    {
        $this->buffer .= str_replace("\r\n", "\n", $chunk);
        while (($pos = strpos($this->buffer, "\n\n")) !== false) {
            $raw = substr($this->buffer, 0, $pos);
            $this->buffer = substr($this->buffer, $pos + 2);
            $data = '';
            foreach (explode("\n", $raw) as $line) {
                if (strpos($line, 'data:') === 0) {
                    $data .= ltrim(substr($line, 5));
                }
            }
            if ($data !== '') {
                $event = json_decode($data);
                if (is_object($event)) {
                    $this->handle($event);
                }
            }
        }
    }

    private function handle($event)
    {
        $emit = $this->emit;
        switch ($event->type ?? '') {
            case 'message_start':
                $this->model = $event->message->model ?? null;
                if (isset($event->message->usage)) {
                    $this->usage = (array) json_decode(json_encode($event->message->usage), true);
                }
                // dropped thinking blocks (drop_block) - kept with the usage so a broken history can be traced
                if (!empty($event->message->input_transformations)) {
                    $this->usage['input_transformations'] = json_decode(json_encode($event->message->input_transformations), true);
                }
                break;
            case 'content_block_start':
                $block = $event->content_block;
                $i = $event->index;
                $type = $block->type ?? '';
                if ($type === 'tool_use' || $type === 'server_tool_use') {
                    $this->json[$i] = '';
                    $emit('tool', ['name' => $block->name ?? '', 'text' => AssistantTools::statusText($block->name ?? '')]);
                } elseif ($type === 'thinking' || $type === 'redacted_thinking') {
                    $emit('status', ['text' => 'Myślę…']);
                } elseif ($type === 'text' && ($block->text ?? '') !== '') {
                    $emit('text', ['text' => $block->text]);
                } elseif ($type === 'web_fetch_tool_result') {
                    $sources = [];
                    Assistant::addFetchedSource($sources, $block);
                    if ($sources) {
                        $emit('source', $sources[0]);
                    }
                }
                $this->blocks[$i] = $block;
                break;
            case 'content_block_delta':
                $i = $event->index;
                $delta = $event->delta;
                if (!isset($this->blocks[$i])) {
                    break;
                }
                $block = $this->blocks[$i];
                switch ($delta->type ?? '') {
                    case 'text_delta':
                        $block->text = ($block->text ?? '') . $delta->text;
                        if ($delta->text !== '') {
                            $emit('text', ['text' => $delta->text]);
                        }
                        break;
                    case 'thinking_delta':
                        $block->thinking = ($block->thinking ?? '') . $delta->thinking;
                        break;
                    case 'signature_delta':
                        $block->signature = $delta->signature;
                        break;
                    case 'input_json_delta':
                        $this->json[$i] = ($this->json[$i] ?? '') . $delta->partial_json;
                        break;
                    default:
                        // a delta this parser does not know - noted, so a changed history can be traced
                        $this->usage['unknown_deltas'][$delta->type ?? '?'] = true;
                        break;
                    case 'citations_delta':
                        if (!isset($block->citations) || !is_array($block->citations)) {
                            $block->citations = [];
                        }
                        $block->citations[] = $delta->citation;
                        $sources = [];
                        Assistant::addSource($sources, $delta->citation);
                        if ($sources) {
                            $emit('source', $sources[0]);
                        }
                        break;
                }
                break;
            case 'content_block_stop':
                $i = $event->index;
                if (isset($this->json[$i], $this->blocks[$i])) {
                    $raw = trim($this->json[$i]);
                    // server tools may send the whole input at block start and no deltas - keep it as sent
                    $given = $this->blocks[$i]->input ?? null;
                    $input = $raw === '' ? (is_object($given) ? $given : new stdClass()) : json_decode($raw);
                    if (!is_object($input)) {
                        // cut off or broken arguments: replay a valid empty input, tell the model it failed
                        $input = new stdClass();
                        $this->invalid[$this->blocks[$i]->id ?? ''] = true;
                    }
                    $this->blocks[$i]->input = $input;
                    unset($this->json[$i]);
                    // say what is being searched / read, so she sees where the facts come from
                    $block = $this->blocks[$i];
                    if (($block->type ?? '') === 'server_tool_use') {
                        if (($block->name ?? '') === 'web_search' && !empty($input->query)) {
                            ($this->emit)('tool', ['name' => 'web_search', 'text' => 'Szukam: ' . mb_substr((string) $input->query, 0, 80) . '…']);
                        } elseif (($block->name ?? '') === 'web_fetch' && !empty($input->url)) {
                            $host = parse_url((string) $input->url, PHP_URL_HOST) ?: 'stronę';
                            ($this->emit)('tool', ['name' => 'web_fetch', 'text' => 'Czytam: ' . preg_replace('/^www\./', '', $host) . '…']);
                        }
                    }
                }
                break;
            case 'message_delta':
                if (isset($event->delta->stop_reason)) {
                    $this->stopReason = $event->delta->stop_reason;
                }
                // final counts (output tokens, searches) - they replace the opening estimate
                if (isset($event->usage)) {
                    foreach ((array) json_decode(json_encode($event->usage), true) as $k => $v) {
                        if ($v !== null) {
                            $this->usage[$k] = $v;
                        }
                    }
                }
                break;
            case 'message_stop':
                $this->finished = true;
                break;
            case 'error':
                $this->error = (array) ($event->error ?? []);
                break;
        }
    }

    public function result()
    {
        ksort($this->blocks);
        // exactly what came back - any change to it breaks the thinking binding on the next request
        $content = array_values($this->blocks);
        // cut off at max_tokens: an unfinished tool call cannot be replayed
        if ($this->stopReason === 'max_tokens') {
            $content = array_values(array_filter($content, function ($b) {
                return !in_array($b->type ?? '', ['tool_use', 'server_tool_use'], true) || isset($b->input);
            }));
        }
        return ['content' => $content, 'stop_reason' => $this->stopReason, 'model' => $this->model, 'invalid' => $this->invalid, 'usage' => $this->usage];
    }
}
