<?php
/**
 * SocialFetcher - pobiera liczbę obserwujących z Instagrama, Facebooka,
 * YouTube i TikToka i zapisuje ją do social_stats.
 *
 * Strategia per platforma (od najpewniejszej do awaryjnej):
 *  - Instagram: publiczne API webowe -> HTML profilu -> RapidAPI (jeśli skonfigurowane)
 *  - Facebook:  Graph API (token z OAuth) -> HTML strony -> RapidAPI (jeśli skonfigurowane)
 *  - YouTube:   Data API v3 (klucz API) -> OAuth token -> HTML kanału
 *  - TikTok:    HTML profilu -> OAuth token (z odświeżaniem)
 *
 * Handle (nazwy profili) pochodzą z tabeli social_profiles (ustawiane w aplikacji),
 * a awaryjnie z api/config/social_credentials.php.
 */

require_once __DIR__ . '/Schema.php';

class SocialFetcher
{
    const PLATFORMS = ['instagram', 'facebook', 'youtube', 'tiktok'];
    const RETRY_AFTER_SECONDS = 3 * 3600; // nie ponawiaj nieudanej próby częściej niż co 3h
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    private $conn;
    private $creds;

    public function __construct(PDO $conn, array $creds = null)
    {
        $this->conn = $conn;
        $this->creds = $creds === null ? self::loadCredentials() : $creds;
        Schema::ensure($conn, 'social_profiles');
        Schema::ensure($conn, 'social_refresh_log');
    }

    public static function loadCredentials()
    {
        $path = __DIR__ . '/social_credentials.php';
        if (!file_exists($path)) {
            return [];
        }
        $creds = require $path;
        return is_array($creds) ? $creds : [];
    }

    // ------------------------------------------------------------------
    // Profiles (handles)
    // ------------------------------------------------------------------

    /**
     * Returns [platform => handle] for the user. Falls back to legacy values in social_credentials.php.
     */
    public function getProfiles($userId)
    {
        $stmt = $this->conn->prepare("SELECT platform, handle FROM social_profiles WHERE user_id = :uid");
        $stmt->execute(['uid' => $userId]);
        $profiles = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if ($row['handle'] !== '') {
                $profiles[$row['platform']] = $row['handle'];
            }
        }

        // Legacy fallbacks from social_credentials.php
        if (empty($profiles['instagram']) && !empty($this->creds['rapidapi']['username'])) {
            $profiles['instagram'] = $this->creds['rapidapi']['username'];
        }
        if (empty($profiles['facebook']) && !empty($this->creds['facebook_rapidapi']['url'])) {
            $profiles['facebook'] = $this->creds['facebook_rapidapi']['url'];
        }
        if (empty($profiles['youtube'])) {
            $stmt = $this->conn->prepare("SELECT provider_user_id FROM social_connections WHERE user_id = :uid AND provider = 'youtube'");
            $stmt->execute(['uid' => $userId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && $row['provider_user_id']) {
                $profiles['youtube'] = $row['provider_user_id'];
            }
        }
        return $profiles;
    }

    public function saveProfiles($userId, array $handles)
    {
        $stmt = $this->conn->prepare("
            INSERT INTO social_profiles (user_id, platform, handle)
            VALUES (:uid, :platform, :handle)
            ON DUPLICATE KEY UPDATE handle = VALUES(handle), updated_at = CURRENT_TIMESTAMP
        ");
        foreach (self::PLATFORMS as $platform) {
            if (!array_key_exists($platform, $handles)) {
                continue;
            }
            $handle = self::normalizeHandle($platform, (string) $handles[$platform]);
            $stmt->execute(['uid' => $userId, 'platform' => $platform, 'handle' => $handle]);
        }
    }

    public static function normalizeHandle($platform, $value)
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        // Accept full URLs and extract the interesting part
        if ($platform === 'instagram' || $platform === 'tiktok') {
            if (preg_match('#(?:instagram\.com|tiktok\.com)/@?([A-Za-z0-9._]+)#i', $value, $m)) {
                $value = $m[1];
            }
            return ltrim($value, '@');
        }
        if ($platform === 'youtube') {
            if (preg_match('#youtube\.com/(?:channel/)?(UC[\w-]{20,})#', $value, $m)) {
                return $m[1];
            }
            if (preg_match('#youtube\.com/(?:c/|user/)?@?([A-Za-z0-9._-]+)#i', $value, $m)) {
                return '@' . $m[1];
            }
            if (strpos($value, 'UC') === 0 && strlen($value) >= 22) {
                return $value;
            }
            return '@' . ltrim($value, '@');
        }
        if ($platform === 'facebook') {
            if (preg_match('#facebook\.com/([^?\s]+)#i', $value, $m)) {
                return rtrim($m[1], '/');
            }
            return $value;
        }
        return $value;
    }

    // ------------------------------------------------------------------
    // Status helpers
    // ------------------------------------------------------------------

    /**
     * Platforms that have a handle or OAuth connection but no stats for today.
     */
    public function stalePlatforms($userId)
    {
        $profiles = $this->getProfiles($userId);
        $connections = $this->getConnections($userId);
        $today = date('Y-m-d');

        $stmt = $this->conn->prepare("SELECT platform, MAX(date) AS last_date FROM social_stats WHERE user_id = :uid GROUP BY platform");
        $stmt->execute(['uid' => $userId]);
        $lastDates = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $lastDates[$row['platform']] = $row['last_date'];
        }

        $stale = [];
        foreach (self::PLATFORMS as $platform) {
            $configured = !empty($profiles[$platform]) || !empty($connections[$platform]);
            if ($configured && (($lastDates[$platform] ?? '') < $today)) {
                $stale[] = $platform;
            }
        }
        return $stale;
    }

    public function lastAttempts($userId)
    {
        $stmt = $this->conn->prepare("
            SELECT l.platform, l.attempted_at, l.success, l.source, l.error
            FROM social_refresh_log l
            INNER JOIN (
                SELECT platform, MAX(id) AS max_id FROM social_refresh_log WHERE user_id = :uid GROUP BY platform
            ) x ON x.max_id = l.id
        ");
        $stmt->execute(['uid' => $userId]);
        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $out[$row['platform']] = [
                'attempted_at' => $row['attempted_at'],
                'success' => (bool) $row['success'],
                'source' => $row['source'],
                'error' => $row['error'],
            ];
        }
        return $out;
    }

    private function getConnections($userId)
    {
        $stmt = $this->conn->prepare("SELECT provider, provider_user_id, access_token, refresh_token, expires_at FROM social_connections WHERE user_id = :uid");
        $stmt->execute(['uid' => $userId]);
        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $out[$row['provider']] = $row;
        }
        return $out;
    }

    // ------------------------------------------------------------------
    // Refresh
    // ------------------------------------------------------------------

    /**
     * Refresh selected (or stale) platforms.
     * @return array platform => ['ok' => bool, 'count' => int|null, 'source' => string, 'error' => string|null, 'skipped' => bool]
     */
    public function refreshUser($userId, array $platforms = null, $force = false)
    {
        $profiles = $this->getProfiles($userId);
        $connections = $this->getConnections($userId);
        $attempts = $this->lastAttempts($userId);
        $targets = $platforms === null ? ($force ? self::PLATFORMS : $this->stalePlatforms($userId)) : $platforms;

        $results = [];
        foreach ($targets as $platform) {
            if (!in_array($platform, self::PLATFORMS, true)) {
                continue;
            }
            $handle = $profiles[$platform] ?? null;
            $connection = $connections[$platform] ?? null;
            if (!$handle && !$connection) {
                $results[$platform] = ['ok' => false, 'count' => null, 'source' => null, 'error' => 'Brak nazwy profilu', 'skipped' => true];
                continue;
            }

            // Back-off after a failed attempt (cron + app both call this)
            if (!$force && isset($attempts[$platform]) && !$attempts[$platform]['success']) {
                $age = time() - strtotime($attempts[$platform]['attempted_at']);
                if ($age < self::RETRY_AFTER_SECONDS) {
                    $results[$platform] = ['ok' => false, 'count' => null, 'source' => null, 'error' => $attempts[$platform]['error'], 'skipped' => true];
                    continue;
                }
            }

            $result = $this->fetchPlatform($platform, $handle, $connection, $userId);
            if ($result['ok']) {
                $this->saveStat($userId, $platform, $result['count']);
            }
            $this->logAttempt($userId, $platform, $result);
            $result['skipped'] = false;
            $results[$platform] = $result;
        }
        return $results;
    }

    private function fetchPlatform($platform, $handle, $connection, $userId)
    {
        $errors = [];
        try {
            switch ($platform) {
                case 'instagram':
                    $strategies = [
                        ['web_api', function () use ($handle) { return $handle ? $this->instagramWebApi($handle) : null; }],
                        ['html', function () use ($handle) { return $handle ? $this->instagramHtml($handle) : null; }],
                        ['rapidapi', function () use ($handle) { return $this->instagramRapidApi($handle); }],
                    ];
                    break;
                case 'facebook':
                    $strategies = [
                        ['graph_api', function () use ($connection) { return $connection ? $this->facebookGraph($connection) : null; }],
                        ['html', function () use ($handle) { return $handle ? $this->facebookHtml($handle) : null; }],
                        ['rapidapi', function () use ($handle) { return $this->facebookRapidApi($handle); }],
                    ];
                    break;
                case 'youtube':
                    $strategies = [
                        ['data_api', function () use ($handle) { return $handle ? $this->youtubeDataApi($handle) : null; }],
                        ['oauth', function () use ($connection, $userId) { return $connection && $connection['access_token'] ? $this->youtubeOAuth($connection, $userId) : null; }],
                        ['html', function () use ($handle) { return $handle ? $this->youtubeHtml($handle) : null; }],
                    ];
                    break;
                case 'tiktok':
                    $strategies = [
                        ['html', function () use ($handle) { return $handle ? $this->tiktokHtml($handle) : null; }],
                        ['oauth', function () use ($connection, $userId) { return $connection && $connection['access_token'] ? $this->tiktokOAuth($connection, $userId) : null; }],
                    ];
                    break;
                default:
                    $strategies = [];
            }

            foreach ($strategies as [$name, $fn]) {
                try {
                    $count = $fn();
                    if ($count !== null && $count > 0) {
                        return ['ok' => true, 'count' => (int) $count, 'source' => $name, 'error' => null];
                    }
                    if ($count !== null) {
                        $errors[] = "$name: 0";
                    }
                } catch (Exception $e) {
                    $errors[] = "$name: " . $e->getMessage();
                }
            }
        } catch (Exception $e) {
            $errors[] = $e->getMessage();
        }

        return ['ok' => false, 'count' => null, 'source' => null, 'error' => $errors ? implode(' | ', $errors) : 'Nie udało się pobrać danych'];
    }

    private function saveStat($userId, $platform, $count)
    {
        $stmt = $this->conn->prepare("
            INSERT INTO social_stats (user_id, platform, followers_count, date)
            VALUES (:uid, :platform, :count, :date)
            ON DUPLICATE KEY UPDATE followers_count = :count_update
        ");
        $stmt->execute([
            'uid' => $userId,
            'platform' => $platform,
            'count' => $count,
            'date' => date('Y-m-d'),
            'count_update' => $count,
        ]);
    }

    private function logAttempt($userId, $platform, array $result)
    {
        $stmt = $this->conn->prepare("
            INSERT INTO social_refresh_log (user_id, platform, success, source, error)
            VALUES (:uid, :platform, :success, :source, :error)
        ");
        $stmt->execute([
            'uid' => $userId,
            'platform' => $platform,
            'success' => $result['ok'] ? 1 : 0,
            'source' => $result['source'],
            'error' => $result['error'] ? mb_substr($result['error'], 0, 500) : null,
        ]);
        // keep the log small
        $this->conn->exec("DELETE FROM social_refresh_log WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 30 DAY)");
    }

    // ------------------------------------------------------------------
    // HTTP
    // ------------------------------------------------------------------

    private function http($url, array $headers = [], $timeout = 15, $post = null)
    {
        $ch = curl_init($url);
        $defaultHeaders = [
            'User-Agent: ' . self::UA,
            'Accept-Language: pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept: text/html,application/json;q=0.9,*/*;q=0.8',
        ];
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_ENCODING => '',
            CURLOPT_HTTPHEADER => array_merge($defaultHeaders, $headers),
        ]);
        if ($post !== null) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($post) ? http_build_query($post) : $post);
        }
        $body = curl_exec($ch);
        $error = curl_error($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body === false) {
            throw new Exception('cURL: ' . $error);
        }
        return [$code, $body];
    }

    /**
     * Parse "12 345", "12,3 tys.", "1,2 mln", "12.3K", "1.2M", "12,345" into an integer.
     */
    public static function parseCount($text)
    {
        if ($text === null) {
            return null;
        }
        $t = mb_strtolower(trim(str_replace(["\xc2\xa0", "\xe2\x80\xaf", ' '], ' ', (string) $text)));
        // number may contain spaces as thousands separators ("48 210"), a decimal part ("12,3") and a suffix ("tys.", "K", "mln")
        if (!preg_match('/(\d(?:[\d ]*\d)?(?:[.,]\d+)?)\s*(tys\.?|mln|mld|k|m|b)?(?![a-z])/u', $t, $m)) {
            return null;
        }
        $num = str_replace(' ', '', $m[1]);
        $suffix = $m[2] ?? '';
        if ($suffix !== '') {
            $value = (float) str_replace(',', '.', $num);
            $mult = ['tys' => 1000, 'tys.' => 1000, 'k' => 1000, 'mln' => 1000000, 'm' => 1000000, 'mld' => 1000000000, 'b' => 1000000000];
            return (int) round($value * ($mult[$suffix] ?? 1));
        }
        // plain number - separators are thousands separators (or the string had spaces removed)
        if (preg_match('/^\d{1,3}([.,]\d{3})+$/', $num)) {
            return (int) preg_replace('/[.,]/', '', $num);
        }
        return (int) round((float) str_replace(',', '.', $num));
    }

    // ------------------------------------------------------------------
    // Instagram
    // ------------------------------------------------------------------

    private function instagramWebApi($handle)
    {
        [$code, $body] = $this->http(
            'https://www.instagram.com/api/v1/users/web_profile_info/?username=' . rawurlencode($handle),
            [
                'x-ig-app-id: 936619743392459',
                'x-requested-with: XMLHttpRequest',
                'Referer: https://www.instagram.com/' . rawurlencode($handle) . '/',
                'Accept: application/json',
            ]
        );
        if ($code !== 200) {
            throw new Exception("HTTP $code");
        }
        $data = json_decode($body, true);
        $count = $data['data']['user']['edge_followed_by']['count'] ?? null;
        return $count === null ? null : (int) $count;
    }

    private function instagramHtml($handle)
    {
        [$code, $body] = $this->http('https://www.instagram.com/' . rawurlencode($handle) . '/');
        if ($code !== 200) {
            throw new Exception("HTTP $code");
        }
        if (preg_match('/"edge_followed_by":\{"count":(\d+)\}/', $body, $m)) {
            return (int) $m[1];
        }
        if (preg_match('/"follower_count":(\d+)/', $body, $m)) {
            return (int) $m[1];
        }
        if (preg_match('/content="([^"]{1,40}?)\s+(?:Followers|obserwuj[a-ząę]+)/iu', $body, $m)) {
            return self::parseCount($m[1]);
        }
        return null;
    }

    private function instagramRapidApi($handle)
    {
        $cfg = $this->creds['rapidapi'] ?? null;
        if (!$cfg || empty($cfg['key']) || $cfg['key'] === 'YOUR_RAPIDAPI_KEY') {
            return null;
        }
        $username = $handle ?: ($cfg['username'] ?? '');
        if (!$username) {
            return null;
        }
        [$code, $body] = $this->http(
            "https://{$cfg['host']}/web-profile?username=" . rawurlencode($username),
            ["x-rapidapi-host: {$cfg['host']}", "x-rapidapi-key: {$cfg['key']}", 'Accept: application/json'],
            30
        );
        if ($code === 429) {
            throw new Exception('limit RapidAPI wyczerpany');
        }
        if ($code !== 200) {
            throw new Exception("HTTP $code");
        }
        $data = json_decode($body, true) ?: [];
        $followers = $data['user_data']['follower_count']
            ?? $data['edge_followed_by']['count']
            ?? $data['data']['user']['edge_followed_by']['count']
            ?? $data['follower_count']
            ?? $data['graphql']['user']['edge_followed_by']['count']
            ?? null;
        if ($followers === null) {
            array_walk_recursive($data, function ($item, $key) use (&$followers) {
                if ($followers === null && $key === 'follower_count' && is_numeric($item)) {
                    $followers = $item;
                }
            });
        }
        return $followers === null ? null : (int) $followers;
    }

    // ------------------------------------------------------------------
    // Facebook
    // ------------------------------------------------------------------

    private function facebookGraph(array $connection)
    {
        if (empty($connection['access_token'])) {
            return null;
        }
        [$code, $body] = $this->http(
            'https://graph.facebook.com/v18.0/me/accounts?fields=followers_count,fan_count&access_token=' . rawurlencode($connection['access_token']),
            ['Accept: application/json']
        );
        if ($code !== 200) {
            throw new Exception("HTTP $code");
        }
        $data = json_decode($body, true);
        if (empty($data['data'][0])) {
            return null;
        }
        $page = $data['data'][0];
        return (int) ($page['followers_count'] ?? $page['fan_count'] ?? 0);
    }

    private function facebookHtml($handle)
    {
        $path = preg_match('#^https?://#i', $handle) ? $handle : 'https://www.facebook.com/' . ltrim($handle, '/');
        foreach ([$path, str_replace('www.facebook.com', 'm.facebook.com', $path)] as $url) {
            try {
                [$code, $body] = $this->http($url, ['Accept: text/html']);
            } catch (Exception $e) {
                continue;
            }
            if ($code !== 200) {
                continue;
            }
            if (preg_match('/"follower_count":(\d+)/', $body, $m)) {
                return (int) $m[1];
            }
            if (preg_match('/([\d][\d\s.,]{0,12}(?:\s?(?:tys\.?|mln|K|M))?)\s+(?:followers|obserwuj[a-ząę]+)/iu', $body, $m)) {
                $count = self::parseCount($m[1]);
                if ($count) {
                    return $count;
                }
            }
        }
        return null;
    }

    private function facebookRapidApi($handle)
    {
        $cfg = $this->creds['facebook_rapidapi'] ?? null;
        if (!$cfg || empty($cfg['key'])) {
            return null;
        }
        $target = $cfg['url'] ?? '';
        if ($handle) {
            $target = preg_match('#^https?://#i', $handle) ? $handle : 'https://www.facebook.com/' . ltrim($handle, '/');
        }
        if (!$target) {
            return null;
        }
        $query = http_build_query([
            'link' => $target,
            'exact_followers_count' => 'true',
            'show_verified_badge' => 'false',
            'proxy_country' => 'us',
            'page_section' => 'default',
        ]);
        [$code, $body] = $this->http(
            "https://{$cfg['host']}/get_facebook_pages_details_from_link?$query",
            ["x-rapidapi-host: {$cfg['host']}", "x-rapidapi-key: {$cfg['key']}", 'Accept: application/json'],
            30
        );
        if ($code === 429) {
            throw new Exception('limit RapidAPI wyczerpany');
        }
        if ($code !== 200) {
            throw new Exception("HTTP $code");
        }
        $data = json_decode($body, true) ?: [];
        $followers = $data['body']['followers_count'] ?? $data['followers_count'] ?? null;
        if ($followers === null) {
            array_walk_recursive($data, function ($item, $key) use (&$followers) {
                if ($followers === null && $key === 'followers_count' && is_numeric($item) && $item > 0) {
                    $followers = $item;
                }
            });
        }
        return $followers === null ? null : (int) $followers;
    }

    // ------------------------------------------------------------------
    // YouTube
    // ------------------------------------------------------------------

    private function youtubeDataApi($handle)
    {
        $apiKey = $this->creds['youtube']['api_key'] ?? null;
        if (!$apiKey || $apiKey === 'YOUR_YOUTUBE_API_KEY') {
            return null;
        }
        $param = strpos($handle, 'UC') === 0 ? 'id=' . rawurlencode($handle) : 'forHandle=' . rawurlencode(ltrim($handle, '@'));
        [$code, $body] = $this->http(
            "https://www.googleapis.com/youtube/v3/channels?part=statistics&$param&key=" . rawurlencode($apiKey),
            ['Accept: application/json']
        );
        if ($code !== 200) {
            $data = json_decode($body, true);
            throw new Exception('API ' . $code . ' ' . ($data['error']['message'] ?? ''));
        }
        $data = json_decode($body, true);
        $count = $data['items'][0]['statistics']['subscriberCount'] ?? null;
        return $count === null ? null : (int) $count;
    }

    private function youtubeOAuth(array $connection, $userId)
    {
        $token = $connection['access_token'];
        $expired = !empty($connection['expires_at']) && strtotime($connection['expires_at']) < time() + 60;
        if ($expired && !empty($connection['refresh_token'])) {
            $token = $this->refreshGoogleToken($connection, $userId);
        }
        if (!$token) {
            return null;
        }
        [$code, $body] = $this->http(
            'https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true',
            ["Authorization: Bearer $token", 'Accept: application/json']
        );
        if ($code !== 200) {
            throw new Exception("HTTP $code");
        }
        $data = json_decode($body, true);
        $count = $data['items'][0]['statistics']['subscriberCount'] ?? null;
        return $count === null ? null : (int) $count;
    }

    private function refreshGoogleToken(array $connection, $userId)
    {
        $cfg = $this->creds['youtube'] ?? [];
        if (empty($cfg['client_id']) || empty($cfg['client_secret'])) {
            return null;
        }
        [$code, $body] = $this->http('https://oauth2.googleapis.com/token', ['Accept: application/json'], 15, [
            'client_id' => $cfg['client_id'],
            'client_secret' => $cfg['client_secret'],
            'refresh_token' => $connection['refresh_token'],
            'grant_type' => 'refresh_token',
        ]);
        $data = json_decode($body, true);
        if ($code !== 200 || empty($data['access_token'])) {
            return null;
        }
        $this->storeToken($userId, 'youtube', $data['access_token'], null, time() + (int) ($data['expires_in'] ?? 3600));
        return $data['access_token'];
    }

    private function youtubeHtml($handle)
    {
        $url = strpos($handle, 'UC') === 0
            ? 'https://www.youtube.com/channel/' . rawurlencode($handle)
            : 'https://www.youtube.com/@' . rawurlencode(ltrim($handle, '@'));
        [$code, $body] = $this->http($url, ['Accept: text/html', 'Cookie: CONSENT=YES+cb; SOCS=CAI']);
        if ($code !== 200) {
            throw new Exception("HTTP $code");
        }
        if (preg_match('/"subscriberCountText":\{"simpleText":"([^"]+)"/', $body, $m)) {
            return self::parseCount($m[1]);
        }
        if (preg_match('/"subscriberCountText":"([^"]+)"/', $body, $m)) {
            return self::parseCount($m[1]);
        }
        if (preg_match('/([\d][\d\s.,]{0,10}\s?(?:tys\.|mln|K|M)?)\s+(?:subskrybentów|subskrybent|subscribers)/iu', $body, $m)) {
            return self::parseCount($m[1]);
        }
        return null;
    }

    // ------------------------------------------------------------------
    // TikTok
    // ------------------------------------------------------------------

    private function tiktokHtml($handle)
    {
        [$code, $body] = $this->http('https://www.tiktok.com/@' . rawurlencode(ltrim($handle, '@')), ['Accept: text/html']);
        if ($code !== 200) {
            throw new Exception("HTTP $code");
        }
        if (preg_match('/"followerCount":(\d+)/', $body, $m)) {
            return (int) $m[1];
        }
        if (preg_match('/content="([^"]{1,20}?)\s+(?:Followers|obserwuj[a-ząę]+)/iu', $body, $m)) {
            return self::parseCount($m[1]);
        }
        return null;
    }

    private function tiktokOAuth(array $connection, $userId)
    {
        $token = $connection['access_token'];
        $expired = !empty($connection['expires_at']) && strtotime($connection['expires_at']) < time() + 60;
        if ($expired && !empty($connection['refresh_token'])) {
            $cfg = $this->creds['tiktok'] ?? [];
            if (!empty($cfg['client_key']) && !empty($cfg['client_secret'])) {
                [$code, $body] = $this->http('https://open.tiktokapis.com/v2/oauth/token/', ['Accept: application/json'], 15, [
                    'client_key' => $cfg['client_key'],
                    'client_secret' => $cfg['client_secret'],
                    'grant_type' => 'refresh_token',
                    'refresh_token' => $connection['refresh_token'],
                ]);
                $data = json_decode($body, true);
                if ($code === 200 && !empty($data['access_token'])) {
                    $token = $data['access_token'];
                    $this->storeToken($userId, 'tiktok', $token, $data['refresh_token'] ?? null, time() + (int) ($data['expires_in'] ?? 86400));
                }
            }
        }
        if (!$token) {
            return null;
        }
        [$code, $body] = $this->http(
            'https://open.tiktokapis.com/v2/user/info/?fields=follower_count',
            ["Authorization: Bearer $token", 'Accept: application/json']
        );
        if ($code !== 200) {
            throw new Exception("HTTP $code");
        }
        $data = json_decode($body, true);
        $count = $data['data']['user']['follower_count'] ?? null;
        return $count === null ? null : (int) $count;
    }

    private function storeToken($userId, $provider, $accessToken, $refreshToken, $expiresAtTs)
    {
        $sql = "UPDATE social_connections SET access_token = :at, expires_at = :exp" . ($refreshToken ? ", refresh_token = :rt" : '') . " WHERE user_id = :uid AND provider = :provider";
        $params = ['at' => $accessToken, 'exp' => date('Y-m-d H:i:s', $expiresAtTs), 'uid' => $userId, 'provider' => $provider];
        if ($refreshToken) {
            $params['rt'] = $refreshToken;
        }
        $this->conn->prepare($sql)->execute($params);
    }
}
