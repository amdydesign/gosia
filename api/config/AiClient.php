<?php
/**
 * Reads screenshots (orders, receipts, briefs) with an AI vision model and
 * returns structured JSON.
 *
 * Keys come from the app settings (Ustawienia -> Czytanie screenów, stored
 * encrypted by AiSettings) or from api/.env; they never reach the browser.
 *   ANTHROPIC_API_KEY  -> Claude (Messages API, structured outputs)
 *   GEMINI_API_KEY     -> Gemini (generateContent, response schema)
 *   AI_PROVIDER        -> optional "claude" | "gemini" when both keys are set
 *   ANTHROPIC_MODEL / GEMINI_MODEL -> optional model override
 *
 * Plain curl on purpose: the official PHP SDK needs PHP 8.1 + a PSR-18 client,
 * and pulling it into the committed vendor/ would raise the platform check for
 * every endpoint on the shared hosting.
 */

class AiClient
{
    const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
    // Screenshots are simple extraction - the cheap, fast Haiku reads them (ANTHROPIC_MODEL overrides).
    // Contracts and "Zrzuć tutaj" notes need more judgement - Sonnet
    // (ANTHROPIC_DOCS_MODEL / ANTHROPIC_NOTES_MODEL override).
    const CLAUDE_MODEL = 'claude-haiku-5-5';
    const CLAUDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
    const CLAUDE_DOCS_MODEL = 'claude-sonnet-5-5';
    const CLAUDE_NOTES_MODEL = 'claude-sonnet-5-5';
    const CLAUDE_IDEAS_MODEL = 'claude-opus-5-5';
    const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent';
    const GEMINI_MODEL = 'gemini-flash-latest';
    const TIMEOUT = 90;

    /** Settings saved in the app: ['provider' => ..., 'claude' => key, 'gemini' => key] */
    private static $config = [];

    /** Model and token usage of the last Claude reply (for the model test script). */
    public static $lastUsage = null;

    public static function configure(array $config)
    {
        self::$config = $config;
    }

    /** API key for "claude" | "gemini": app settings first, then api/.env (owner's account only). */
    public static function key($provider)
    {
        $fromApp = trim((string) (self::$config[$provider] ?? ''));
        if ($fromApp !== '') {
            return $fromApp;
        }
        if (!(self::$config['allow_env'] ?? true)) {
            return '';
        }
        return trim($_ENV[$provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY'] ?? '');
    }

    /** Where the key comes from: "app", "env" or null. */
    public static function keySource($provider)
    {
        if (trim((string) (self::$config[$provider] ?? '')) !== '') {
            return 'app';
        }
        return self::key($provider) !== '' ? 'env' : null;
    }

    /**
     * Active provider: "claude", "gemini" or null when no key is configured.
     */
    public static function provider()
    {
        $hasClaude = self::key('claude') !== '';
        $hasGemini = self::key('gemini') !== '';
        $preferred = strtolower(trim((string) (self::$config['provider'] ?? '') ?: ($_ENV['AI_PROVIDER'] ?? '')));

        if ($preferred === 'gemini' && $hasGemini) {
            return 'gemini';
        }
        if ($preferred === 'claude' && $hasClaude) {
            return 'claude';
        }
        if ($hasClaude) {
            return 'claude';
        }
        return $hasGemini ? 'gemini' : null;
    }

    /**
     * @param string $prompt  instructions (Polish)
     * @param array  $images  [['media_type' => 'image/jpeg', 'data' => '<base64>'], ...]
     * @param array  $schema  JSON Schema of the expected object
     * @return array decoded JSON
     * @throws RuntimeException with a user-facing (Polish) message
     */
    public static function extract($prompt, array $images, array $schema)
    {
        $provider = self::provider();
        if ($provider === 'claude') {
            return self::extractWithClaude($prompt, $images, $schema);
        }
        if ($provider === 'gemini') {
            return self::extractWithGemini($prompt, $images, $schema);
        }
        throw new RuntimeException('Rozpoznawanie screenów jest wyłączone - brak klucza AI na serwerze.');
    }

    /**
     * Read a document (contract) with Claude only - documents may be under NDA,
     * so they are never sent to Gemini (its free tier may train on inputs).
     *
     * @param array $parts [['media_type' => 'application/pdf'|'image/*', 'data' => '<base64>'] | ['text' => '...'], ...]
     */
    public static function extractDocument($prompt, array $parts, array $schema)
    {
        if (self::key('claude') === '') {
            throw new RuntimeException('Rozpoznawanie dokumentów wymaga klucza Claude (Ustawienia -> Czytanie screenów).');
        }
        return self::extractWithClaude($prompt, $parts, $schema, [
            'model' => trim($_ENV['ANTHROPIC_DOCS_MODEL'] ?? '') ?: self::CLAUDE_DOCS_MODEL,
            'max_tokens' => 32000,
            'effort' => 'medium',
            'timeout' => 240,
        ]);
    }

    /**
     * What is on a shared screenshot ("Skróty -> Gonia", a screen dropped into "Zrzuć tutaj").
     * It may be a contract or a private message, so Claude (no training on inputs) is used
     * whenever its key is there; Gemini only when it is the sole provider.
     */
    public static function classifyImage($prompt, array $images, array $schema)
    {
        if (self::key('claude') !== '') {
            return self::extractWithClaude($prompt, $images, $schema, ['max_tokens' => 4000, 'timeout' => 60]);
        }
        if (self::provider() === 'gemini') {
            return self::extractWithGemini($prompt, $images, $schema);
        }
        throw new RuntimeException('Rozpoznawanie screenów wymaga klucza AI (Ustawienia -> Czytanie screenów).');
    }

    /**
     * Sort a short free-text note ("Zrzuć tutaj") into structured data.
     * Text only, so it may also go to Gemini when that is the chosen provider.
     */
    public static function classifyText($prompt, $text, array $schema)
    {
        $provider = self::provider();
        if ($provider === 'claude') {
            return self::extractWithClaude($prompt, [['text' => $text]], $schema, [
                'model' => trim($_ENV['ANTHROPIC_NOTES_MODEL'] ?? '') ?: self::CLAUDE_NOTES_MODEL,
                'max_tokens' => 8000,
                'timeout' => 60,
            ]);
        }
        if ($provider === 'gemini') {
            return self::extractWithGemini($prompt . "\n\nNotatka:\n" . $text, [], $schema);
        }
        throw new RuntimeException('Rozpoznawanie notatek wymaga klucza AI (Ustawienia -> Czytanie screenów).');
    }

    /**
     * Write new reel ideas with scripts ("Generator rolek") in the style of the recorded ones.
     * Creative writing - Opus 5.5 won the model test (api/cron/compare_models.php): best hooks,
     * real examples, kept to the length; Sonnet and Fable ran long, Haiku was flat.
     */
    public static function writeIdeas($prompt, $examples, array $schema, array $options = [])
    {
        // $examples: text, or text parts ([['text' => ..., 'cache' => true], ['text' => ...]])
        $parts = is_array($examples) ? $examples : [['text' => $examples]];
        $provider = self::provider();
        if ($provider === 'claude') {
            return self::extractWithClaude($prompt, $parts, $schema, $options + [
                'model' => trim($_ENV['ANTHROPIC_IDEAS_MODEL'] ?? '') ?: self::CLAUDE_IDEAS_MODEL,
                'max_tokens' => 16000,
                'effort' => 'medium',
                'timeout' => 120,
            ]);
        }
        if ($provider === 'gemini') {
            return self::extractWithGemini($prompt . "\n\n" . implode('', array_column($parts, 'text')), [], $schema);
        }
        throw new RuntimeException('Generator rolek wymaga klucza AI (Ustawienia -> Czytanie screenów).');
    }

    // ---------------------------------------------------------------- Claude

    /**
     * @param array $images  image parts; a PDF (media_type application/pdf) becomes a document
     *                       block and ['text' => ...] a text block
     * @param array $options model, max_tokens, effort (defaults: ANTHROPIC_MODEL / Haiku, 16000, low)
     */
    public static function buildClaudeBody($prompt, array $images, array $schema, $withFallbacks = true, array $options = [])
    {
        $content = [];
        foreach ($images as $image) {
            if (isset($image['text'])) {
                $block = ['type' => 'text', 'text' => $image['text']];
                // a long block that repeats between calls (her reel scripts) is cached for 5 minutes
                if (!empty($image['cache'])) {
                    $block['cache_control'] = ['type' => 'ephemeral'];
                }
                $content[] = $block;
                continue;
            }
            $content[] = [
                'type' => $image['media_type'] === 'application/pdf' ? 'document' : 'image',
                'source' => [
                    'type' => 'base64',
                    'media_type' => $image['media_type'],
                    'data' => $image['data'],
                ],
            ];
        }
        $content[] = ['type' => 'text', 'text' => $prompt];

        $body = [
            'model' => $options['model'] ?? (trim($_ENV['ANTHROPIC_MODEL'] ?? '') ?: self::CLAUDE_MODEL),
            'max_tokens' => $options['max_tokens'] ?? 16000,
            // Reading a screenshot is simple - low effort keeps it fast
            'output_config' => [
                'effort' => $options['effort'] ?? 'low',
                'format' => ['type' => 'json_schema', 'schema' => $schema],
            ],
            'messages' => [['role' => 'user', 'content' => $content]],
        ];
        if ($withFallbacks) {
            // Re-run on Anthropic's recommended model if a safety classifier declines
            $body['fallbacks'] = 'default';
        }
        return $body;
    }

    public static function parseClaudeResponse(array $response)
    {
        if (($response['stop_reason'] ?? '') === 'refusal') {
            throw new RuntimeException('Model odmówił odczytania tego obrazu. Spróbuj innego screena.');
        }
        if (($response['stop_reason'] ?? '') === 'max_tokens') {
            throw new RuntimeException('Odpowiedź AI była za długa. Spróbuj mniejszego screena.');
        }
        foreach ($response['content'] ?? [] as $block) {
            if (($block['type'] ?? '') === 'text') {
                return self::decodeJson($block['text']);
            }
        }
        throw new RuntimeException('AI nie zwróciło danych. Spróbuj ponownie.');
    }

    private static function extractWithClaude($prompt, array $images, array $schema, array $options = [])
    {
        $key = self::key('claude');
        $headers = [
            'Content-Type: application/json',
            'x-api-key: ' . $key,
            'anthropic-version: 2023-06-01',
        ];
        $timeout = $options['timeout'] ?? self::TIMEOUT;

        // Haiku has no server-side refusal fallback - send the beta only for other models
        $model = $options['model'] ?? (trim($_ENV['ANTHROPIC_MODEL'] ?? '') ?: self::CLAUDE_MODEL);
        $withFallbacks = strpos($model, 'haiku') === false;

        if ($withFallbacks) {
            [$status, $data] = self::post(
                static::CLAUDE_URL,
                array_merge($headers, ['anthropic-beta: ' . self::CLAUDE_FALLBACK_BETA]),
                self::buildClaudeBody($prompt, $images, $schema, true, $options),
                $timeout
            );
        }

        // The fallback beta is optional - if the API rejects it, retry once without it
        if (!$withFallbacks || ($status === 400 && stripos(json_encode($data['error'] ?? []), 'fallback') !== false)) {
            [$status, $data] = self::post(static::CLAUDE_URL, $headers, self::buildClaudeBody($prompt, $images, $schema, false, $options), $timeout);
        }

        if ($status !== 200) {
            throw new RuntimeException(self::httpErrorMessage('Claude', $status, $data['error']['message'] ?? ''));
        }
        self::$lastUsage = ['model' => $data['model'] ?? $model] + ($data['usage'] ?? []);
        return self::parseClaudeResponse($data);
    }

    // ---------------------------------------------------------------- Gemini

    public static function buildGeminiBody($prompt, array $images, array $schema)
    {
        $parts = [];
        foreach ($images as $image) {
            $parts[] = ['inline_data' => ['mime_type' => $image['media_type'], 'data' => $image['data']]];
        }
        $parts[] = ['text' => $prompt];

        return [
            'contents' => [['role' => 'user', 'parts' => $parts]],
            'generationConfig' => [
                'temperature' => 0,
                'responseMimeType' => 'application/json',
                'responseSchema' => self::toGeminiSchema($schema),
            ],
        ];
    }

    /**
     * JSON Schema -> Gemini's OpenAPI subset (uppercase types, no additionalProperties).
     */
    public static function toGeminiSchema(array $schema)
    {
        $out = [];
        foreach ($schema as $key => $value) {
            if ($key === 'additionalProperties') {
                continue;
            }
            if ($key === 'type' && is_string($value)) {
                $out['type'] = strtoupper($value);
            } elseif ($key === 'properties' && is_array($value)) {
                $out['properties'] = [];
                foreach ($value as $name => $sub) {
                    $out['properties'][$name] = self::toGeminiSchema($sub);
                }
            } elseif ($key === 'items' && is_array($value)) {
                $out['items'] = self::toGeminiSchema($value);
            } else {
                $out[$key] = $value;
            }
        }
        if (isset($out['enum']) && ($out['type'] ?? '') === 'STRING') {
            $out['format'] = 'enum';
        }
        return $out;
    }

    public static function parseGeminiResponse(array $response)
    {
        if (!empty($response['promptFeedback']['blockReason'])) {
            throw new RuntimeException('Gemini zablokowało ten obraz. Spróbuj innego screena.');
        }
        $candidate = $response['candidates'][0] ?? null;
        if (!$candidate) {
            throw new RuntimeException('AI nie zwróciło danych. Spróbuj ponownie.');
        }
        $text = '';
        foreach ($candidate['content']['parts'] ?? [] as $part) {
            if (isset($part['text']) && empty($part['thought'])) {
                $text .= $part['text'];
            }
        }
        if ($text === '') {
            $reason = $candidate['finishReason'] ?? '';
            throw new RuntimeException($reason === 'SAFETY'
                ? 'Gemini zablokowało ten obraz. Spróbuj innego screena.'
                : 'AI nie zwróciło danych. Spróbuj ponownie.');
        }
        return self::decodeJson($text);
    }

    private static function extractWithGemini($prompt, array $images, array $schema)
    {
        $model = trim($_ENV['GEMINI_MODEL'] ?? '') ?: self::GEMINI_MODEL;
        [$status, $data] = self::post(
            sprintf(static::GEMINI_URL, rawurlencode($model)),
            ['Content-Type: application/json', 'x-goog-api-key: ' . self::key('gemini')],
            self::buildGeminiBody($prompt, $images, $schema)
        );
        if ($status !== 200) {
            throw new RuntimeException(self::httpErrorMessage('Gemini', $status, $data['error']['message'] ?? ''));
        }
        return self::parseGeminiResponse($data);
    }

    /**
     * Check a key without spending tokens (lists models).
     * @return bool|null true = works, false = rejected, null = could not check
     */
    public static function verifyKey($provider, $key)
    {
        if ($provider === 'claude') {
            $url = 'https://api.anthropic.com/v1/models?limit=1';
            $headers = ['x-api-key: ' . $key, 'anthropic-version: 2023-06-01'];
        } else {
            $url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1';
            $headers = ['x-goog-api-key: ' . $key];
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 12,
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false || $status === 0 || $status >= 500 || $status === 429) {
            return null;
        }
        if ($status === 200) {
            return true;
        }
        // Gemini answers 400 API_KEY_INVALID for a wrong key
        return in_array($status, [400, 401, 403], true) ? false : null;
    }

    // ---------------------------------------------------------------- shared

    private static function post($url, array $headers, array $body, $timeout = self::TIMEOUT)
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => $timeout,
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new RuntimeException('Brak połączenia z usługą AI (' . $error . ').');
        }
        $data = json_decode($raw, true);
        return [$status, is_array($data) ? $data : []];
    }

    private static function httpErrorMessage($name, $status, $detail)
    {
        if ($status === 401 || $status === 403) {
            return "Klucz {$name} jest nieprawidłowy - sprawdź api/.env.";
        }
        if ($status === 429) {
            return "Limit zapytań {$name} wyczerpany. Spróbuj za chwilę.";
        }
        if ($status === 413) {
            return 'Obraz jest za duży. Spróbuj mniejszego screena.';
        }
        if ($status >= 500 || $status === 529) {
            return "{$name} jest chwilowo niedostępne. Spróbuj za chwilę.";
        }
        return "Błąd {$name} ({$status})" . ($detail ? ': ' . mb_substr($detail, 0, 200) : '');
    }

    private static function decodeJson($text)
    {
        $data = json_decode(trim($text), true);
        if (!is_array($data) && preg_match('/\{.*\}/s', $text, $m)) {
            $data = json_decode($m[0], true);
        }
        if (!is_array($data)) {
            throw new RuntimeException('Nie udało się odczytać odpowiedzi AI. Spróbuj ponownie.');
        }
        return $data;
    }
}
