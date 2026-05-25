<?php

use App\Core\{Auth, CSRF, Lang, Session};

if (!function_exists('config')) {
    function config(string $key, mixed $default = null): mixed
    {
        static $cache = [];
        $parts  = explode('.', $key);
        $file   = array_shift($parts);

        if (!isset($cache[$file])) {
            $path = BASE_PATH . "/config/{$file}.php";
            $cache[$file] = file_exists($path) ? require $path : [];
        }

        $value = $cache[$file];
        foreach ($parts as $part) {
            if (!is_array($value) || !array_key_exists($part, $value)) {
                return $default;
            }
            $value = $value[$part];
        }
        return $value;
    }
}

if (!function_exists('env')) {
    function env(string $key, mixed $default = null): mixed
    {
        $val = $_ENV[$key] ?? getenv($key);
        if ($val === false) {
            return $default;
        }
        return match (strtolower((string) $val)) {
            'true'  => true,
            'false' => false,
            'null'  => null,
            default => $val,
        };
    }
}

if (!function_exists('__')) {
    function __(string $key, string $default = ''): string
    {
        return Lang::get($key, $default);
    }
}

if (!function_exists('e')) {
    function e(mixed $val): string
    {
        return htmlspecialchars((string) $val, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}

if (!function_exists('redirect')) {
    function redirect(string $url, int $status = 302): never
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        http_response_code($status);
        header("Location: {$url}");
        exit;
    }
}

if (!function_exists('csrf_field')) {
    function csrf_field(): string
    {
        return CSRF::field();
    }
}

if (!function_exists('csrf_token')) {
    function csrf_token(): string
    {
        return CSRF::token();
    }
}

if (!function_exists('auth')) {
    function auth(): App\Core\Auth
    {
        return new App\Core\Auth();
    }
}

if (!function_exists('flash')) {
    function flash(string $key, mixed $value = null): mixed
    {
        if ($value !== null) {
            Session::flash($key, $value);
            return null;
        }
        return Session::getFlash($key);
    }
}

if (!function_exists('url')) {
    function url(string $path = ''): string
    {
        $base = rtrim(config('app.url', ''), '/');
        return $base . '/' . ltrim($path, '/');
    }
}

if (!function_exists('asset')) {
    function asset(string $path): string
    {
        return url('assets/' . ltrim($path, '/'));
    }
}

if (!function_exists('formatCurrency')) {
    function formatCurrency(float $amount, string $currency = 'TZS'): string
    {
        return $currency . ' ' . number_format($amount, 2);
    }
}

if (!function_exists('formatDate')) {
    function formatDate(string|null $date, string $format = 'd M Y'): string
    {
        if (!$date) return '-';
        try {
            return (new DateTimeImmutable($date))->format($format);
        } catch (\Throwable) {
            return $date;
        }
    }
}

if (!function_exists('timeAgo')) {
    function timeAgo(string $datetime): string
    {
        $diff = time() - strtotime($datetime);
        return match(true) {
            $diff < 60     => 'sasa hivi',
            $diff < 3600   => (int)($diff/60)    . ' dakika zilizopita',
            $diff < 86400  => (int)($diff/3600)  . ' saa zilizopita',
            $diff < 604800 => (int)($diff/86400) . ' siku zilizopita',
            default        => formatDate($datetime),
        };
    }
}

if (!function_exists('generateCode')) {
    function generateCode(string $prefix = '', int $length = 8): string
    {
        return strtoupper($prefix . bin2hex(random_bytes((int)ceil($length / 2))));
    }
}

if (!function_exists('activeClass')) {
    function activeClass(string $path, string $class = 'active'): string
    {
        $current = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        return str_starts_with($current, $path) ? $class : '';
    }
}

if (!function_exists('pagePath')) {
    function pagePath(int $page): string
    {
        $params = array_merge($_GET, ['page' => $page]);
        return '?' . http_build_query($params);
    }
}

if (!function_exists('truncate')) {
    function truncate(string $str, int $length = 80): string
    {
        return mb_strlen($str) > $length ? mb_substr($str, 0, $length) . '…' : $str;
    }
}
