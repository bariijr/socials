<?php

namespace App\Core\Channels;

class WhatsApp
{
    public static function send(string $phone, string $message): bool
    {
        $phone     = self::normalizePhone($phone);
        $accountSid = env('WA_ACCOUNT_SID', '');
        $authToken  = env('WA_AUTH_TOKEN', '');
        $from       = env('WA_FROM', '');

        if (!$accountSid || !$authToken || !$from) {
            error_log('WhatsApp: Twilio credentials not configured');
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
            error_log('WhatsApp cURL error: ' . $error);
            return false;
        }

        return $httpCode >= 200 && $httpCode < 300;
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
