<?php

namespace App\Core\Channels;

class SMS
{
    public static function send(string $phone, string $message): bool
    {
        $phone = self::normalizePhone($phone);
        $username = env('AT_USERNAME', '');
        $apiKey   = env('AT_API_KEY', '');
        $sender   = env('AT_SENDER_ID', '');

        if (!$username || !$apiKey) {
            error_log('SMS: Africa\'s Talking credentials not configured');
            return false;
        }

        $data = [
            'username' => $username,
            'to'       => $phone,
            'message'  => $message,
        ];
        if ($sender) {
            $data['from'] = $sender;
        }

        $ch = curl_init('https://api.africastalking.com/version1/messaging');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query($data),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'apiKey: ' . $apiKey,
                'Content-Type: application/x-www-form-urlencoded',
                'Accept: application/json',
            ],
        ]);

        $response = curl_exec($ch);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) {
            error_log('SMS cURL error: ' . $error);
            return false;
        }

        $decoded = json_decode($response, true);
        return isset($decoded['SMSMessageData']['Recipients'][0]['status'])
            && str_contains($decoded['SMSMessageData']['Recipients'][0]['status'], 'Success');
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
