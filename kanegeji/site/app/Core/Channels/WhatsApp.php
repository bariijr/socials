<?php

namespace App\Core\Channels;

/**
 * Multi-provider WhatsApp channel.
 *
 * Provider is selected via WA_PROVIDER in .env:
 *   evolution  — Evolution API (self-hosted, open-source)
 *   whatchamp  — WhatChimp cloud API
 *   twilio     — Twilio WhatsApp (legacy / fallback)
 *
 * Scheduling: pass a Unix timestamp as $scheduleAt.
 *   Evolution converts it to ISO-8601 (scheduledAt field).
 *   WhatChimp sends it as schedule_at (ISO-8601).
 *   Twilio does not support scheduled sends — scheduleAt is ignored.
 */
class WhatsApp
{
    /**
     * @param string   $phone      Recipient phone — any local or E.164 format.
     * @param string   $message    Plain-text message body.
     * @param int|null $scheduleAt Unix timestamp for delayed delivery (null = send now).
     */
    public static function send(string $phone, string $message, ?int $scheduleAt = null): bool
    {
        $phone    = self::normalizePhone($phone);
        $provider = strtolower(trim(env('WA_PROVIDER', 'evolution')));

        return match ($provider) {
            'evolution' => self::sendEvolution($phone, $message, $scheduleAt),
            'whatchamp' => self::sendWhatchamp($phone, $message, $scheduleAt),
            'twilio'    => self::sendTwilio($phone, $message),
            default     => self::unknownProvider($provider),
        };
    }

    // ── Evolution API ─────────────────────────────────────────
    // Self-hosted open-source WhatsApp gateway.
    // Docs: https://doc.evolution-api.com
    // Env:  WA_EVOLUTION_URL, WA_EVOLUTION_INSTANCE, WA_EVOLUTION_API_KEY
    private static function sendEvolution(string $phone, string $message, ?int $scheduleAt): bool
    {
        $baseUrl  = rtrim(env('WA_EVOLUTION_URL', ''), '/');
        $instance = env('WA_EVOLUTION_INSTANCE', '');
        $apiKey   = env('WA_EVOLUTION_API_KEY', '');

        if (!$baseUrl || !$instance || !$apiKey) {
            error_log('WhatsApp[evolution]: WA_EVOLUTION_URL / WA_EVOLUTION_INSTANCE / WA_EVOLUTION_API_KEY not configured');
            return false;
        }

        $body = [
            'number'  => $phone . '@s.whatsapp.net',
            'text'    => $message,
            'options' => ['delay' => 1000, 'presence' => 'composing'],
        ];

        if ($scheduleAt !== null) {
            // Evolution API v2 scheduled messages
            $body['scheduledAt'] = date('c', $scheduleAt); // ISO 8601
        }

        return self::httpPost(
            "{$baseUrl}/message/sendText/{$instance}",
            $body,
            ['apikey: ' . $apiKey],
            fn($code, $resp) => $code >= 200 && $code < 300
        );
    }

    // ── WhatChimp ─────────────────────────────────────────────
    // Cloud WhatsApp API service.
    // Verify exact endpoint + response format against your WhatChimp dashboard docs.
    // Env:  WA_WHATCHAMP_URL (default: https://api.whatchamp.com/v1),
    //       WA_WHATCHAMP_API_KEY
    private static function sendWhatchamp(string $phone, string $message, ?int $scheduleAt): bool
    {
        $baseUrl = rtrim(env('WA_WHATCHAMP_URL', 'https://api.whatchamp.com/v1'), '/');
        $apiKey  = env('WA_WHATCHAMP_API_KEY', '');

        if (!$apiKey) {
            error_log('WhatsApp[whatchamp]: WA_WHATCHAMP_API_KEY not configured');
            return false;
        }

        $body = [
            'phone'   => ltrim($phone, '+'),
            'message' => $message,
        ];

        if ($scheduleAt !== null) {
            $body['schedule_at'] = date('c', $scheduleAt); // ISO 8601 — confirm field name with WhatChimp docs
        }

        return self::httpPost(
            "{$baseUrl}/send",
            $body,
            ['Authorization: Bearer ' . $apiKey],
            fn($code, $resp) => $code >= 200 && $code < 300
        );
    }

    // ── Twilio (legacy fallback) ──────────────────────────────
    // Env:  WA_ACCOUNT_SID, WA_AUTH_TOKEN, WA_FROM (+phone number)
    // Note: Twilio scheduled WA sends require Content API — not implemented here.
    private static function sendTwilio(string $phone, string $message): bool
    {
        $accountSid = env('WA_ACCOUNT_SID', '');
        $authToken  = env('WA_AUTH_TOKEN', '');
        $from       = env('WA_FROM', '');

        if (!$accountSid || !$authToken || !$from) {
            error_log('WhatsApp[twilio]: WA_ACCOUNT_SID / WA_AUTH_TOKEN / WA_FROM not configured');
            return false;
        }

        $url = "https://api.twilio.com/2010-04-01/Accounts/{$accountSid}/Messages.json";

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_USERPWD        => "{$accountSid}:{$authToken}",
            CURLOPT_POSTFIELDS     => http_build_query([
                'From' => 'whatsapp:' . $from,
                'To'   => 'whatsapp:' . $phone,
                'Body' => $message,
            ]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
        ]);

        $response = curl_exec($ch);
        $error    = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($error) {
            error_log('WhatsApp[twilio] cURL: ' . $error);
            return false;
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            error_log("WhatsApp[twilio] HTTP {$httpCode}: {$response}");
            return false;
        }

        return true;
    }

    // ── Shared HTTP helper ────────────────────────────────────
    /**
     * @param callable $successCheck fn(int $httpCode, string $body): bool
     */
    private static function httpPost(string $url, array $body, array $extraHeaders, callable $successCheck): bool
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($body),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => array_merge(
                ['Content-Type: application/json', 'Accept: application/json'],
                $extraHeaders
            ),
        ]);

        $response = curl_exec($ch);
        $error    = curl_error($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($error) {
            error_log("WhatsApp POST [{$url}] cURL: {$error}");
            return false;
        }

        $ok = $successCheck($httpCode, (string) $response);
        if (!$ok) {
            error_log("WhatsApp POST [{$url}] HTTP {$httpCode}: {$response}");
        }

        return $ok;
    }

    private static function unknownProvider(string $provider): bool
    {
        error_log("WhatsApp: unknown provider '{$provider}'. Set WA_PROVIDER to evolution, whatchamp, or twilio.");
        return false;
    }

    private static function normalizePhone(string $phone): string
    {
        $phone = preg_replace('/\D/', '', $phone);
        if (str_starts_with($phone, '0') && strlen($phone) === 10) {
            $phone = '+255' . substr($phone, 1);
        } elseif (!str_starts_with($phone, '+')) {
            $phone = '+' . $phone;
        }
        return $phone;
    }
}
