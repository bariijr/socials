<?php

namespace App\Core;

class CSRF
{
    private const TOKEN_KEY = '_csrf_token';
    private const TOKEN_TTL = 3600;

    public static function token(): string
    {
        if (!Session::has(self::TOKEN_KEY) || self::isExpired()) {
            $_SESSION[self::TOKEN_KEY]        = bin2hex(random_bytes(32));
            $_SESSION[self::TOKEN_KEY . '_ts'] = time();
        }
        return $_SESSION[self::TOKEN_KEY];
    }

    public static function field(): string
    {
        return '<input type="hidden" name="_csrf_token" value="' . htmlspecialchars(self::token(), ENT_QUOTES) . '">';
    }

    public static function verify(): void
    {
        $token     = $_POST['_csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        $stored    = $_SESSION[self::TOKEN_KEY] ?? '';

        if (!$stored || !hash_equals($stored, $token)) {
            http_response_code(419);
            die('CSRF token mismatch. Please go back and try again.');
        }
    }

    private static function isExpired(): bool
    {
        $ts = $_SESSION[self::TOKEN_KEY . '_ts'] ?? 0;
        return (time() - $ts) > self::TOKEN_TTL;
    }
}
