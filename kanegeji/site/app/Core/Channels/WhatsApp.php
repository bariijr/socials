<?php

namespace App\Core\Channels;

class WhatsApp
{
    private const API_URL = 'https://apigw.beemafrica.com/v1/be/whatsapp/text';

    public static function send(string $phone, string $message): bool
    {
        $phone     = self::normalizePhone($phone);
        $apiKey    = env('BEEM_API_KEY', '');
        $secretKey = env('BEEM_SECRET_KEY', '');

        if (!$apiKey || !$secretKey) {
            error_log('WhatsApp: Beem Africa credentials not configured (BEEM_API_KEY / BEEM_SECRET_KEY)');
            return false;
        }

        $payload = json_encode([
            'to'      => ltrim($phone, '+'),
            'message' => $message,
        ]);

        $ch = curl_init(self::API_URL);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_USERPWD        => "{$apiKey}:{$secretKey}",
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
            ],
        ]);

        $response = curl_exec($ch);
        $error    = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($error) {
            error_log('WhatsApp cURL error: ' . $error);
            return false;
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            error_log("WhatsApp Beem Africa HTTP {$httpCode}: {$response}");
            return false;
        }

        $decoded = json_decode($response, true);
        return isset($decoded['successful']) && $decoded['successful'] === true;
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
