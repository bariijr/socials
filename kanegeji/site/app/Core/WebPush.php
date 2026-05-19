<?php

namespace App\Core;

use Minishlink\WebPush\WebPush as MinishlinkWebPush;
use Minishlink\WebPush\Subscription;

/**
 * Browser Web Push notifications via VAPID.
 * Requires: composer require minishlink/web-push
 *
 * Env vars:
 *   VAPID_PUBLIC_KEY   — base64url-encoded public key (from make vapid-keys)
 *   VAPID_PRIVATE_KEY  — base64url-encoded private key
 *   APP_URL            — used as VAPID subject
 *
 * Generate keys once:
 *   php -r "
 *     \$kp = \Minishlink\WebPush\VAPID::createVapidKeys();
 *     echo 'VAPID_PUBLIC_KEY='.\$kp['publicKey'].PHP_EOL;
 *     echo 'VAPID_PRIVATE_KEY='.\$kp['privateKey'].PHP_EOL;
 *   "
 */
class WebPush
{
    /**
     * Send a push notification to one subscriber.
     *
     * @param array $subscription {endpoint, p256dh, auth}
     * @param string $title
     * @param string $body
     * @param string|null $url    URL to open when the notification is clicked.
     */
    public static function send(array $subscription, string $title, string $body, ?string $url = null): bool
    {
        try {
            $webPush = self::instance();
            $sub     = Subscription::create([
                'endpoint' => $subscription['endpoint'],
                'keys'     => ['p256dh' => $subscription['p256dh'], 'auth' => $subscription['auth']],
            ]);

            $payload = json_encode(['title' => $title, 'body' => $body, 'url' => $url ?? '/']);
            $report  = $webPush->sendOneNotification($sub, $payload);

            if (!$report->isSuccess()) {
                error_log('WebPush send failed: ' . $report->getReason());
                return false;
            }
            return true;
        } catch (\Throwable $e) {
            error_log('WebPush::send error: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Broadcast a push notification to all subscribers of a parish.
     * Returns the number of successful sends.
     */
    public static function broadcast(int $parishId, string $title, string $body, ?string $url = null): int
    {
        $subscriptions = Database::select(
            "SELECT ps.endpoint, ps.p256dh, ps.auth
             FROM push_subscriptions ps
             JOIN users u ON u.id = ps.user_id
             WHERE u.parish_id = ? AND u.active = 1 AND u.deleted_at IS NULL",
            [$parishId]
        );

        if (empty($subscriptions)) return 0;

        $sent = 0;
        foreach ($subscriptions as $sub) {
            if (self::send($sub, $title, $body, $url)) {
                $sent++;
            }
        }
        return $sent;
    }

    // ── VAPID auth helper ─────────────────────────────────────

    private static function instance(): MinishlinkWebPush
    {
        $publicKey  = env('VAPID_PUBLIC_KEY', '');
        $privateKey = env('VAPID_PRIVATE_KEY', '');
        $subject    = env('APP_URL', 'https://example.com');

        if (!$publicKey || !$privateKey) {
            throw new \RuntimeException('Web Push: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not configured');
        }

        return new MinishlinkWebPush([
            'VAPID' => [
                'subject'    => $subject,
                'publicKey'  => $publicKey,
                'privateKey' => $privateKey,
            ],
        ]);
    }
}
