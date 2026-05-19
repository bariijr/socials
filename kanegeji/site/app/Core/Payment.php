<?php

namespace App\Core;

/**
 * Payment gateway dispatcher.
 * Routes to the configured gateway: Selcom (default) or Azam Pay.
 *
 * Set PAYMENT_GATEWAY=selcom  (default) or PAYMENT_GATEWAY=azampay in .env.
 *
 * Both gateways return a uniform array from initiateMno():
 *   ['success' => bool, 'transaction_id' => string|null, 'message' => string, 'raw' => string]
 *
 * parseCallback() auto-detects the gateway from the payload structure.
 */
class Payment
{
    // ── Public facade ─────────────────────────────────────────

    /**
     * Initiate a mobile-money STK / USSD push.
     *
     * @param array $data {
     *   phone:       string
     *   amount:      int|float
     *   provider:    string  mpesa|tigopesa|airtelmoney|halopesa
     *   external_id: string  Your unique reference
     *   name:        string  Buyer name (used by Selcom)
     *   email:       string  Buyer email (used by Selcom)
     *   currency:    string  default TZS
     * }
     * @return array{success: bool, transaction_id: string|null, message: string, raw: string}
     */
    public static function initiateMno(array $data): array
    {
        return self::useSelcom()
            ? Selcom::createOrder($data)
            : self::azamInitiate($data);
    }

    /**
     * Parse a gateway webhook callback.
     * Auto-detects Selcom vs Azam Pay by payload structure.
     *
     * @return array|null {external_id, transaction_id, status, amount, message}
     */
    public static function parseCallback(string $rawBody): ?array
    {
        $data = json_decode($rawBody, true);

        // Selcom callbacks contain "order_id"; Azam Pay callbacks contain "externalId"
        if (isset($data['order_id'])) {
            return Selcom::parseCallback($rawBody);
        }

        return self::azamParseCallback($rawBody);
    }

    /**
     * Query the live status of a payment from the gateway.
     * Returns null if the gateway cannot be reached.
     *
     * @param string $gatewayRef  The transaction ID returned at order creation.
     */
    public static function queryStatus(string $gatewayRef): ?array
    {
        if (self::useSelcom()) {
            return Selcom::orderStatus($gatewayRef);
        }
        return null; // Azam Pay has no polling endpoint in this integration
    }

    // ── Gateway selector ──────────────────────────────────────

    private static function useSelcom(): bool
    {
        return strtolower(env('PAYMENT_GATEWAY', 'selcom')) !== 'azampay';
    }

    // ── Azam Pay implementation (legacy / optional) ──────────

    private const TOKEN_CACHE = BASE_PATH . '/storage/cache/azam_token.json';

    private const AZAM_PROVIDERS = ['mpesa', 'tigopesa', 'airtelmoney', 'halopesa'];

    private static function azamInitiate(array $data): array
    {
        $provider = strtolower($data['provider'] ?? '');
        if (!in_array($provider, self::AZAM_PROVIDERS, true)) {
            return ['success' => false, 'transaction_id' => null, 'message' => "Unknown provider: {$provider}", 'raw' => ''];
        }

        $providerMap = [
            'mpesa'       => 'Mpesa',
            'tigopesa'    => 'Tigopesa',
            'airtelmoney' => 'AirtelMoney',
            'halopesa'    => 'HaloPesa',
        ];

        try {
            $token   = self::azamGetToken();
            $payload = json_encode([
                'AccountNumber'        => self::azamNormalizePhone($data['phone']),
                'Amount'               => (string) round((float) $data['amount'], 2),
                'Currency'             => $data['currency'] ?? 'TZS',
                'ExternalID'           => $data['external_id'],
                'Provider'             => $providerMap[$provider],
                'AdditionalProperties' => new \stdClass(),
            ]);

            $ch = curl_init(self::azamApiUrl() . '/azampay/mno/checkout');
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

            if ($error) throw new \RuntimeException("cURL: {$error}");

            $decoded = json_decode($response, true);
            $ok      = isset($decoded['success']) && $decoded['success'] === true;

            return [
                'success'        => $ok,
                'transaction_id' => $decoded['transactionId'] ?? null,
                'message'        => $decoded['message'] ?? "HTTP {$httpCode}",
                'raw'            => $response,
            ];
        } catch (\Throwable $e) {
            error_log('AzamPay::initiate: ' . $e->getMessage());
            return ['success' => false, 'transaction_id' => null, 'message' => $e->getMessage(), 'raw' => ''];
        }
    }

    private static function azamParseCallback(string $rawBody): ?array
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

    private static function azamGetToken(): string
    {
        if (file_exists(self::TOKEN_CACHE)) {
            $cached = json_decode(file_get_contents(self::TOKEN_CACHE), true);
            if (isset($cached['token'], $cached['expires']) && time() < ($cached['expires'] - 60)) {
                return $cached['token'];
            }
        }

        $authUrl = self::azamAuthUrl() . '/AppRegistration/GenerateToken';
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
        $expires = isset($data['data']['expire']) ? strtotime($data['data']['expire']) : time() + 3600;

        file_put_contents(self::TOKEN_CACHE, json_encode(['token' => $token, 'expires' => $expires]));
        return $token;
    }

    private static function azamAuthUrl(): string
    {
        return env('AZAM_ENV', 'sandbox') === 'sandbox'
            ? 'https://sandbox.azampay.co.tz'
            : rtrim(env('AZAM_AUTH_URL', 'https://authenticator.azampay.co.tz'), '/');
    }

    private static function azamApiUrl(): string
    {
        return env('AZAM_ENV', 'sandbox') === 'sandbox'
            ? 'https://sandbox.azampay.co.tz'
            : rtrim(env('AZAM_API_URL', 'https://api.azampay.co.tz'), '/');
    }

    private static function azamNormalizePhone(string $phone): string
    {
        $phone = preg_replace('/\D/', '', $phone);
        if (str_starts_with($phone, '0') && strlen($phone) === 10) {
            return '255' . substr($phone, 1);
        }
        return ltrim($phone, '+');
    }
}
