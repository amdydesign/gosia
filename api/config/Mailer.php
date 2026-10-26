<?php
/**
 * Plain-text e-mail through the hosting's mail() (dHosting sends it from the domain).
 * MAIL_FROM in api/.env overrides the sender (default: no-reply@<domain>).
 */

class Mailer
{
    public static function send($to, $subject, $body)
    {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || !function_exists('mail')) {
            return false;
        }
        $host = preg_replace('/^www\./', '', preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'localhost'));
        $from = trim($_ENV['MAIL_FROM'] ?? '') ?: 'no-reply@' . $host;
        $headers = implode("\r\n", [
            'From: Gonia <' . $from . '>',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'MIME-Version: 1.0',
        ]);
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        return @mail($to, $encodedSubject, $body, $headers, '-f' . $from);
    }

    /** https://<this host> - for links in e-mails. */
    public static function appUrl()
    {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }
}
