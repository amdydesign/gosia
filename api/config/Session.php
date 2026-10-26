<?php
/**
 * Login session in an HttpOnly cookie (JavaScript cannot read it, so an XSS cannot steal it).
 *
 * "Zapamiętaj mnie": 90 days, renewed on use - she stays logged in as long as she
 * opens the app now and then. Without it: a browser-session cookie, 12 h idle.
 * Same-site only (SameSite=Strict) and non-GET API calls must carry the
 * X-Requested-With header the app sends - together that blocks CSRF.
 */

require_once __DIR__ . '/JWTHandler.php';

class Session
{
    const COOKIE = 'gonia_session';
    const REMEMBER_DAYS = 90;
    const SHORT_HOURS = 12;
    // renew the cookie at most this often (seconds) so not every request writes a header
    const RENEW_REMEMBER_AFTER = 86400;
    const RENEW_SHORT_AFTER = 1800;

    /** Log in on this device: set the cookie. */
    public static function start($userId, $username, $tokenVersion, $remember)
    {
        $ttl = $remember ? self::REMEMBER_DAYS * 86400 : self::SHORT_HOURS * 3600;
        $jwt = new JWTHandler();
        $token = $jwt->generateToken($userId, $username, $tokenVersion, $ttl, ['rem' => $remember ? 1 : 0]);
        self::setCookie($token, $remember ? time() + $ttl : 0);
        return $token;
    }

    /** Sliding expiry: re-issue a cookie that is getting old (payload from a valid token). */
    public static function renewIfOld(array $payload)
    {
        $remember = !empty($payload['rem']);
        $age = time() - (int) ($payload['iat'] ?? 0);
        if ($age < ($remember ? self::RENEW_REMEMBER_AFTER : self::RENEW_SHORT_AFTER)) {
            return;
        }
        self::start($payload['sub'], $payload['username'] ?? '', $payload['token_version'] ?? 1, $remember);
    }

    public static function end()
    {
        self::setCookie('', time() - 3600);
    }

    public static function cookieToken()
    {
        $value = $_COOKIE[self::COOKIE] ?? '';
        return is_string($value) && $value !== '' ? $value : null;
    }

    private static function setCookie($value, $expires)
    {
        if (headers_sent()) {
            return;
        }
        setcookie(self::COOKIE, $value, [
            'expires' => $expires,
            'path' => '/api/',
            'secure' => self::isHttps(),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        $_COOKIE[self::COOKIE] = $value;
    }

    private static function isHttps()
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
            || (($_SERVER['SERVER_PORT'] ?? '') === '443');
    }

    /** Non-GET requests authenticated by the cookie must come from the app itself. */
    public static function isAppRequest()
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return true;
        }
        return strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'gonia';
    }
}
