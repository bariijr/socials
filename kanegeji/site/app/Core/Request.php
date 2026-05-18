<?php

namespace App\Core;

class Request
{
    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function uri(): string
    {
        return $_SERVER['REQUEST_URI'] ?? '/';
    }

    public static function isPost(): bool
    {
        return self::method() === 'POST';
    }

    public static function isGet(): bool
    {
        return self::method() === 'GET';
    }

    public static function isAjax(): bool
    {
        return ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest';
    }

    public static function ip(): string
    {
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $key) {
            if (!empty($_SERVER[$key])) {
                return explode(',', $_SERVER[$key])[0];
            }
        }
        return '0.0.0.0';
    }

    public static function userAgent(): string
    {
        return substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500);
    }

    public static function post(string $key, mixed $default = null): mixed
    {
        return $_POST[$key] ?? $default;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return $_GET[$key] ?? $default;
    }

    public static function input(string $key, mixed $default = null): mixed
    {
        return $_POST[$key] ?? $_GET[$key] ?? $default;
    }

    public static function all(): array
    {
        return array_merge($_GET, $_POST);
    }

    public static function file(string $key): array|null
    {
        return $_FILES[$key] ?? null;
    }

    public static function only(array $keys): array
    {
        $data = self::all();
        return array_intersect_key($data, array_flip($keys));
    }

    public static function sanitize(string $key, mixed $default = null): string
    {
        $val = self::input($key, $default);
        return htmlspecialchars(trim((string) $val), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    public static function int(string $key, int $default = 0): int
    {
        return (int) filter_var(self::input($key, $default), FILTER_SANITIZE_NUMBER_INT);
    }

    public static function float(string $key, float $default = 0.0): float
    {
        return (float) filter_var(self::input($key, $default), FILTER_SANITIZE_NUMBER_FLOAT, FILTER_FLAG_ALLOW_FRACTION);
    }

    public static function date(string $key, string $default = ''): string
    {
        $val = self::input($key, $default);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $val)) {
            return (string) $val;
        }
        return $default;
    }
}
