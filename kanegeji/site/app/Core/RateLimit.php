<?php

namespace App\Core;

class RateLimit
{
    /**
     * Returns true if the action is allowed, false if limit exceeded.
     * Uses a file-based counter stored in storage/cache.
     */
    public static function check(string $key, int $maxAttempts, int $windowSeconds): bool
    {
        $cacheFile = BASE_PATH . '/storage/cache/rl_' . md5($key) . '.json';
        $now       = time();

        $data = ['count' => 0, 'window_start' => $now];

        if (file_exists($cacheFile)) {
            $raw = json_decode(file_get_contents($cacheFile), true) ?? [];
            if (isset($raw['window_start']) && ($now - $raw['window_start']) < $windowSeconds) {
                $data = $raw;
            }
        }

        $data['count']++;
        file_put_contents($cacheFile, json_encode($data));

        return $data['count'] <= $maxAttempts;
    }

    public static function clear(string $key): void
    {
        $cacheFile = BASE_PATH . '/storage/cache/rl_' . md5($key) . '.json';
        if (file_exists($cacheFile)) {
            unlink($cacheFile);
        }
    }

    public static function remaining(string $key, int $maxAttempts, int $windowSeconds): int
    {
        $cacheFile = BASE_PATH . '/storage/cache/rl_' . md5($key) . '.json';
        $now       = time();

        if (!file_exists($cacheFile)) {
            return $maxAttempts;
        }

        $data = json_decode(file_get_contents($cacheFile), true) ?? [];

        if (!isset($data['window_start']) || ($now - $data['window_start']) >= $windowSeconds) {
            return $maxAttempts;
        }

        return max(0, $maxAttempts - ($data['count'] ?? 0));
    }
}
