<?php

namespace App\Core;

class Lang
{
    private static array  $translations = [];
    private static string $locale       = 'sw';

    public static function load(string $locale): void
    {
        self::$locale = $locale;
        $path = BASE_PATH . "/lang/{$locale}.json";

        if (file_exists($path)) {
            self::$translations = json_decode(file_get_contents($path), true) ?? [];
        }
    }

    public static function get(string $key, string $default = ''): string
    {
        $parts = explode('.', $key);
        $value = self::$translations;

        foreach ($parts as $part) {
            if (!is_array($value) || !isset($value[$part])) {
                return $default ?: $key;
            }
            $value = $value[$part];
        }

        return is_string($value) ? $value : ($default ?: $key);
    }

    public static function locale(): string
    {
        return self::$locale;
    }

    public static function setLocale(string $locale): void
    {
        if (in_array($locale, config('app.locales', ['sw', 'en']))) {
            self::$locale = $locale;
            self::load($locale);
        }
    }
}
