<?php

namespace App\Core;

/**
 * Selcom PESA payment gateway (Tanzania mobile money USSD push).
 * Supports: M-Pesa, Tigo Pesa, Airtel Money, HaloPesa via Selcom aggregation.
 * Docs: https://developers.selcommobile.com
 *
 * Authentication: HMAC-SHA256 over selected request fields.
 * Headers: Authorization: SELCOM {api_key}, Timestamp, Digest, Signed-Fields, Signature.
 *
 * Env vars required:
 *   SELCOM_API_KEY       — API key from Selcom merchant portal
 *   SELCOM_API_SECRET    — API secret for HMAC signing
 *   SELCOM_VENDOR_ID     — Vendor/merchant ID assigned by Selcom
 *   SELCOM_BASE_URL      — default: https://apigw.selcommobile.com/v1
 */
class Selcom
{
    private const RESULTCODE_SUCCESS = '000';
    private const RESULTCODE_PENDING = '001';

    // ── Order creation (USSD push) ────────────────────────────

    /**
     * Create a Selcom checkout order which initiates a USSD push to the customer.
     *
     * @param array $data {
     *   phone:       string   E.164-normalised or local (07XXXXXXXX)
     *   amount:      int|float TZS amount (decimals stripped)
     *   provider:    string   mpesa|tigopesa|airtelmoney|halopesa (informational only)
     *   external_id: string   Your unique order reference stored in payments table
     *   name:        string   Buyer full name (optional)
     *   email:       string   Buyer email (optional)
     *   currency:    string   default TZS
     * }
     * @return array{success: bool, transaction_id: string|null, message: string, raw: string}
     */
    public static function createOrder(array $data): array
    {
        try {
            $vendor   = env('SELCOM_VENDOR_ID', '');
            $orderId  = $data['external_id'];
            $phone    = self::normalizePhone($data['phone']);
            $amount   = (string) intval((float) $data['amount']);
            $name     = $data['name']  ?? 'Customer';
            $email    = $data['email'] ?? env('MAIL_FROM_ADDRESS', 'noreply@example.com');
            $currency = $data['currency'] ?? 'TZS';
            $appUrl   = rtrim(env('APP_URL', ''), '/');

            $body = [
                'vendor'                      => $vendor,
                'order_id'                    => $orderId,
                'buyer_email'                 => $email,
                'buyer_name'                  => $name,
                'buyer_phone'                 => $phone,
                'amount'                      => $amount,
                'currency'                    => $currency,
                'payment_phone'               => $phone,
                'due_date'                    => date('Y-m-d', strtotime('+1 day')),
                'redirect_url'                => "{$appUrl}/pay/status/{$orderId}",
                'cancel_url'                  => "{$appUrl}/pay/status/{$orderId}",
                'webhook'                     => "{$appUrl}/pay/callback",
                'no_of_items'                 => 1,
                'billing.firstname'           => $name,
                'billing.lastname'            => $name,
                'billing.address_1'           => 'Tanzania',
                'billing.city'               => 'Dar es Salaam',
                'billing.state_or_region'    => 'Dar es Salaam',
                'billing.postcode_or_pobox'  => '00000',
                'billing.country'            => 'TZ',
                'billing.phone'              => $phone,
            ];

            // Signed fields — names and their values in the same order
            $signedNames  = 'vendor,order_id,buyer_email,buyer_name,buyer_phone,amount,currency,payment_phone';
            $signedValues = [$vendor, $orderId, $email, $name, $phone, $amount, $currency, $phone];
            $timestamp    = date('YmdHis');
            $headers      = self::buildHeaders($timestamp, $signedValues, $signedNames);

            $result = self::http('POST', self::baseUrl() . '/checkout/create-order', $body, $headers);

            $ok    = ($result['data']['resultcode'] ?? '') === self::RESULTCODE_SUCCESS;
            $txnId = $result['data']['transid'] ?? null;

            return [
                'success'        => $ok,
                'transaction_id' => $txnId,
                'message'        => $result['data']['message'] ?? $result['data']['result'] ?? "HTTP {$result['code']}",
                'raw'            => $result['body'],
            ];
        } catch (\Throwable $e) {
            error_log('Selcom::createOrder error: ' . $e->getMessage());
            return ['success' => false, 'transaction_id' => null, 'message' => $e->getMessage(), 'raw' => ''];
        }
    }

    // ── Order status check ────────────────────────────────────

    /**
     * Query the status of a previously created Selcom order.
     *
     * @param string $transid  The Selcom transid returned by createOrder()
     * @return array{status: string, transaction_id: string, external_id: string, amount: float, message: string}
     */
    public static function orderStatus(string $transid): array
    {
        try {
            $timestamp    = date('YmdHis');
            $signedNames  = 'transid';
            $signedValues = [$transid];
            $headers      = self::buildHeaders($timestamp, $signedValues, $signedNames);

            $url    = self::baseUrl() . '/checkout/order-status?' . http_build_query(['transid' => $transid]);
            $result = self::http('GET', $url, [], $headers);

            $rc = $result['data']['resultcode'] ?? '';

            if ($rc === self::RESULTCODE_SUCCESS) {
                $status = 'completed';
            } elseif ($rc === self::RESULTCODE_PENDING) {
                $status = 'pending';
            } else {
                $status = 'failed';
            }

            return [
                'status'         => $status,
                'transaction_id' => $result['data']['transid']   ?? $transid,
                'external_id'    => $result['data']['order_id']  ?? '',
                'amount'         => (float) ($result['data']['amount'] ?? 0),
                'message'        => $result['data']['message']   ?? $result['data']['result'] ?? '',
            ];
        } catch (\Throwable $e) {
            error_log('Selcom::orderStatus error: ' . $e->getMessage());
            return ['status' => 'pending', 'transaction_id' => $transid, 'external_id' => '', 'amount' => 0, 'message' => $e->getMessage()];
        }
    }

    // ── Callback parsing ──────────────────────────────────────

    /**
     * Parse and validate a Selcom webhook callback POST body.
     * Returns null if the payload does not look like a Selcom callback.
     *
     * Selcom sends:
     *   { "transid": "...", "order_id": "...", "resultcode": "000",
     *     "result": "SUCCESS", "msisdn": "...", "amount": "...", "message": "..." }
     *
     * @return array|null {external_id, transaction_id, status, amount, message}
     */
    public static function parseCallback(string $rawBody): ?array
    {
        $data = json_decode($rawBody, true);
        if (!is_array($data) || !isset($data['order_id'])) {
            return null;
        }

        $status = ($data['resultcode'] ?? '') === self::RESULTCODE_SUCCESS ? 'completed' : 'failed';

        return [
            'external_id'    => $data['order_id'],
            'transaction_id' => $data['transid'] ?? null,
            'status'         => $status,
            'amount'         => (float) ($data['amount'] ?? 0),
            'message'        => $data['message'] ?? ($data['result'] ?? ''),
        ];
    }

    // ── HMAC auth helpers ─────────────────────────────────────

    /**
     * Build Selcom authentication headers.
     * Signature = base64(HMAC-SHA256("{timestamp}*{v1}*{v2}*...", api_secret))
     */
    private static function buildHeaders(string $timestamp, array $signedValues, string $signedFields): array
    {
        $signatureStr = $timestamp;
        foreach ($signedValues as $v) {
            $signatureStr .= '*' . $v;
        }

        $signature = base64_encode(
            hash_hmac('sha256', $signatureStr, env('SELCOM_API_SECRET', ''), true)
        );

        return [
            'Content-Type: application/json;charset=utf-8',
            'Accept: application/json',
            'Authorization: SELCOM ' . env('SELCOM_API_KEY', ''),
            'Timestamp: ' . $timestamp,
            'Digest: HS256',
            'Signed-Fields: ' . $signedFields,
            'Signature: ' . $signature,
        ];
    }

    // ── HTTP helper ───────────────────────────────────────────

    /**
     * @return array{code: int, body: string, data: array}
     * @throws \RuntimeException on cURL failure
     */
    private static function http(string $method, string $url, array $body, array $headers): array
    {
        $ch   = curl_init($url);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_SSL_VERIFYPEER => true,
        ];

        if ($method === 'POST') {
            $opts[CURLOPT_POST]       = true;
            $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
        }

        curl_setopt_array($ch, $opts);
        $response = curl_exec($ch);
        $code     = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new \RuntimeException("Selcom cURL error: {$error}");
        }

        return [
            'code' => $code,
            'body' => (string) $response,
            'data' => json_decode((string) $response, true) ?? [],
        ];
    }

    // ── Phone normalisation ───────────────────────────────────

    private static function normalizePhone(string $phone): string
    {
        $phone = preg_replace('/\D/', '', $phone);
        if (str_starts_with($phone, '0') && strlen($phone) === 10) {
            return '255' . substr($phone, 1);
        }
        if (!str_starts_with($phone, '255')) {
            return '255' . ltrim($phone, '+');
        }
        return $phone;
    }

    private static function baseUrl(): string
    {
        return rtrim(env('SELCOM_BASE_URL', 'https://apigw.selcommobile.com/v1'), '/');
    }
}
