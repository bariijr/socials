<?php

namespace App\Core;

/**
 * Azam Pay payment gateway (Tanzania mobile money STK push).
 * Supports: Mpesa, Tigopesa, AirtelMoney, HaloPesa.
 * Docs: https://developerdocs.azampay.co.tz
 *
 * Env vars required:
 *   AZAM_APP_NAME, AZAM_CLIENT_ID, AZAM_CLIENT_SECRET
 *   AZAM_AUTH_URL  (default: https://authenticator.azampay.co.tz)
 *   AZAM_API_URL   (default: https://api.azampay.co.tz)
 *   AZAM_ENV       (sandbox | production — sandbox uses sandbox.azampay.co.tz)
 */
class Payment
{
    private const TOKEN_CACHE = BASE_PATH . '/storage/cache/azam_token.json';

    private const PROVIDERS = ['mpesa', 'tigopesa', 'airtelmoney', 'halopesa'];

    // ── Token management ──────────────────────────────────────

    public static function getToken(): string
    {
        // Return cached token if still valid (buffer 60 s)
        if (file_exists(self::TOKEN_CACHE)) {
            $cached = json_decode(file_get_contents(self::TOKEN_CACHE), true);
            if (isset($cached['token'], $cached['expires']) && time() < ($cached['expires'] - 60)) {
                return $cached['token'];
            }
        }

        $authUrl = self::authUrl() . '/AppRegistration/GenerateToken';
        $payload = json_encode([
            'appName'      => env('AZAM_APP_NAME', 'KanegejiERP'),
            'clientId'     => env('AZAM_CLIENT_ID', ''),
            'clientSecret' => env('AZAM_CLIENT_SECRET', ''),
        ]);

        $ch = curl_init($authUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
        ]);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error || $httpCode !== 200) {
            throw new \RuntimeException("Azam Pay token error HTTP {$httpCode}: {$response} {$error}");
        }

        $data = json_decode($response, true);
        if (empty($data['data']['accessToken'])) {
            throw new \RuntimeException('Azam Pay: missing accessToken in response');
        }

        $token   = $data['data']['accessToken'];
        $expires = isset($data['data']['expire'])
            ? strtotime($data['data']['expire'])
            : time() + 3600;

        file_put_contents(self::TOKEN_CACHE, json_encode(['token' => $token, 'expires' => $expires]));

        return $token;
    }

    // ── MNO (Mobile Network Operator) STK push ─────────────

    /**
     * Initiate a mobile-money STK push.
     *
     * @param array $data {
     *   phone:       string  Subscriber phone (any local or E.164)
     *   amount:      int|float
     *   provider:    string  mpesa|tigopesa|airtelmoney|halopesa
     *   external_id: string  Your unique reference (stored in payments table)
     *   currency:    string  default TZS
     * }
     * @return array{success: bool, transaction_id: string|null, message: string}
     */
    public static function initiateMno(array $data): array
    {
        $provider = strtolower($data['provider'] ?? '');
        if (!in_array($provider, self::PROVIDERS, true)) {
            return ['success' => false, 'transaction_id' => null, 'message' => "Unknown provider: {$provider}"];
        }

        $providerMap = [
            'mpesa'       => 'Mpesa',
            'tigopesa'    => 'Tigopesa',
            'airtelmoney' => 'AirtelMoney',
            'halopesa'    => 'HaloPesa',
        ];

        try {
            $token   = self::getToken();
            $payload = json_encode([
                'AccountNumber'        => self::normalizePhone($data['phone']),
                'Amount'               => (string) round((float) $data['amount'], 2),
                'Currency'             => $data['currency'] ?? 'TZS',
                'ExternalID'           => $data['external_id'],
                'Provider'             => $providerMap[$provider],
                'AdditionalProperties' => new \stdClass(),
            ]);

            $ch = curl_init(self::apiUrl() . '/azampay/mno/checkout');
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 30,
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/json',
                    'Accept: application/json',
                    'Authorization: Bearer ' . $token,
                ],
            ]);

            $response = curl_exec($ch);
            $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error    = curl_error($ch);
            curl_close($ch);

            if ($error) {
                throw new \RuntimeException("cURL: {$error}");
            }

            $decoded = json_decode($response, true);
            $success = isset($decoded['success']) && $decoded['success'] === true;

            return [
                'success'        => $success,
                'transaction_id' => $decoded['transactionId'] ?? null,
                'message'        => $decoded['message'] ?? "HTTP {$httpCode}",
                'raw'            => $response,
            ];
        } catch (\Throwable $e) {
            error_log('Azam Pay initiateMno: ' . $e->getMessage());
            return ['success' => false, 'transaction_id' => null, 'message' => $e->getMessage()];
        }
    }

    // ── Callback verification ─────────────────────────────────

    /**
     * Parse and validate an Azam Pay webhook callback.
     * Returns null if the payload is invalid.
     *
     * @return array|null {external_id, transaction_id, status, amount, message}
     */
    public static function parseCallback(string $rawBody): ?array
    {
        $data = json_decode($rawBody, true);
        if (!isset($data['externalId'], $data['transactionId'])) {
            return null;
        }

        return [
            'external_id'    => $data['externalId'],
            'transaction_id' => $data['transactionId'],
            'status'         => strtolower($data['status'] ?? 'failed') === 'success' ? 'completed' : 'failed',
            'amount'         => (float) ($data['amount'] ?? 0),
            'message'        => $data['message'] ?? '',
        ];
    }

    // ── Helpers ───────────────────────────────────────────────

    private static function authUrl(): string
    {
        if (env('AZAM_ENV', 'sandbox') === 'sandbox') {
            return 'https://sandbox.azampay.co.tz';
        }
        return rtrim(env('AZAM_AUTH_URL', 'https://authenticator.azampay.co.tz'), '/');
    }

    private static function apiUrl(): string
    {
        if (env('AZAM_ENV', 'sandbox') === 'sandbox') {
            return 'https://sandbox.azampay.co.tz';
        }
        return rtrim(env('AZAM_API_URL', 'https://api.azampay.co.tz'), '/');
    }

    private static function normalizePhone(string $phone): string
    {
        $phone = preg_replace('/\D/', '', $phone);
        if (str_starts_with($phone, '0') && strlen($phone) === 10) {
            return '255' . substr($phone, 1);
        }
        return ltrim($phone, '+');
    }
}
