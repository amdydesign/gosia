<?php
/**
 * Plain-text e-mail through the hosting's mail() (dHosting sends it from the domain).
 * MAIL_FROM in api/.env overrides the sender (default: no-reply@<domain>).
 * APP_URL in api/.env is the address used in links; without it the request's host is
 * used, but only when it looks like a plain host name (the Host header comes from the client).
 */

class Mailer
{
    const HOST_PATTERN = '/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/';

    public static function send($to, $subject, $body)
    {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || !function_exists('mail')) {
            return false;
        }
        $host = preg_replace('/^www\./', '', self::host());
        $from = trim($_ENV['MAIL_FROM'] ?? '');
        if (!filter_var($from, FILTER_VALIDATE_EMAIL)) {
            $from = 'no-reply@' . $host;
        }
        $headers = implode("\r\n", [
            'From: Gonia <' . $from . '>',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'MIME-Version: 1.0',
        ]);
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        return @mail($to, $encodedSubject, $body, $headers, '-f' . $from);
    }

    /** https://<app address> - for links in e-mails. */
    public static function appUrl()
    {
        $configured = self::configuredUrl();
        if ($configured !== null) {
            return $configured;
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        return ($https ? 'https' : 'http') . '://' . self::requestHost(true);
    }

    /** APP_URL from api/.env ("https://panel.example.pl"), or null when not set / not a plain address. */
    private static function configuredUrl()
    {
        $url = rtrim(trim((string) ($_ENV['APP_URL'] ?? '')), '/');
        if (!preg_match('#^(https?)://([^/:?\#@]+)(:\d{1,5})?$#i', $url, $m) || !preg_match(self::HOST_PATTERN, strtolower($m[2]))) {
            return null;
        }
        return strtolower($m[1]) . '://' . strtolower($m[2]) . ($m[3] ?? '');
    }

    /** Host name without the port: from APP_URL, else the request's Host header when it is a valid name. */
    private static function host()
    {
        $configured = self::configuredUrl();
        if ($configured !== null) {
            return parse_url($configured, PHP_URL_HOST);
        }
        return self::requestHost(false);
    }

    /** The request's Host header when it is a valid host name (optionally with its port), else "localhost". */
    private static function requestHost($withPort)
    {
        $raw = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? '')));
        if (!preg_match('/^([^:]+)(:\d{1,5})?$/', $raw, $m) || !preg_match(self::HOST_PATTERN, $m[1])) {
            return 'localhost';
        }
        return $m[1] . ($withPort ? ($m[2] ?? '') : '');
    }
}
