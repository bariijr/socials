<?php

namespace App\Core;

/**
 * RFC 6238 TOTP (Time-based One-Time Password) — no external dependencies.
 * Compatible with Google Authenticator, Authy, and any RFC 6238 app.
 */
class TOTP
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    private const STEP      = 30;   // seconds per code
    private const DIGITS    = 6;

    // ── Secret management ─────────────────────────────────────

    /** Generate a cryptographically random Base32 secret (20 bytes = 160 bits). */
    public static function generateSecret(): string
    {
        return self::base32Encode(random_bytes(20));
    }

    /** Generate 8 single-use backup codes (stored as bcrypt hashes). */
    public static function generateBackupCodes(): array
    {
        $plain  = [];
        $hashed = [];
        for ($i = 0; $i < 8; $i++) {
            $code     = strtoupper(bin2hex(random_bytes(4))); // 8 hex chars
            $plain[]  = $code;
            $hashed[] = password_hash($code, PASSWORD_BCRYPT);
        }
        return ['plain' => $plain, 'hashed' => $hashed];
    }

    // ── Verification ──────────────────────────────────────────

    /**
     * Verify a 6-digit TOTP code.
     *
     * @param string $secret    Base32 secret stored for the user.
     * @param string $code      6-digit code entered by the user.
     * @param int    $tolerance Number of 30-second windows before/after to accept (default 1 = ±30 s).
     */
    public static function verify(string $secret, string $code, int $tolerance = 1): bool
    {
        $code = preg_replace('/\s/', '', $code);
        if (!ctype_digit($code) || strlen($code) !== self::DIGITS) {
            return false;
        }

        $step = (int) floor(time() / self::STEP);

        for ($t = -$tolerance; $t <= $tolerance; $t++) {
            if (hash_equals(self::generate($secret, $step + $t), $code)) {
                return true;
            }
        }

        return false;
    }

    /** Try to consume a backup code. Mutates $hashedCodes (remove used code). */
    public static function verifyBackupCode(string $code, array &$hashedCodes): bool
    {
        $code = strtoupper(trim($code));
        foreach ($hashedCodes as $i => $hash) {
            if (password_verify($code, $hash)) {
                array_splice($hashedCodes, $i, 1);
                return true;
            }
        }
        return false;
    }

    // ── OTPAuth URI (for QR code) ─────────────────────────────

    public static function getUri(string $secret, string $email, string $issuer): string
    {
        return 'otpauth://totp/'
            . rawurlencode($issuer . ':' . $email)
            . '?secret=' . $secret
            . '&issuer=' . rawurlencode($issuer)
            . '&algorithm=SHA1&digits=6&period=30';
    }

    // ── Internal HOTP generation ──────────────────────────────

    private static function generate(string $secret, int $step): string
    {
        $key     = self::base32Decode($secret);
        $counter = pack('N*', 0, $step);        // 8-byte big-endian counter
        $hash    = hash_hmac('sha1', $counter, $key, true);
        $offset  = ord($hash[19]) & 0x0f;
        $value   = (
            ((ord($hash[$offset])     & 0x7f) << 24) |
            ((ord($hash[$offset + 1]) & 0xff) << 16) |
            ((ord($hash[$offset + 2]) & 0xff) <<  8) |
            ((ord($hash[$offset + 3]) & 0xff))
        );
        return str_pad((string) ($value % (10 ** self::DIGITS)), self::DIGITS, '0', STR_PAD_LEFT);
    }

    // ── Base32 ────────────────────────────────────────────────

    private static function base32Encode(string $bytes): string
    {
        $output = '';
        $buf    = 0;
        $bits   = 0;
        for ($i = 0, $len = strlen($bytes); $i < $len; $i++) {
            $buf  = ($buf << 8) | ord($bytes[$i]);
            $bits += 8;
            while ($bits >= 5) {
                $bits  -= 5;
                $output .= self::ALPHABET[($buf >> $bits) & 0x1f];
            }
        }
        if ($bits > 0) {
            $output .= self::ALPHABET[($buf << (5 - $bits)) & 0x1f];
        }
        return $output;
    }

    private static function base32Decode(string $str): string
    {
        $str    = strtoupper(preg_replace('/[^A-Z2-7]/', '', $str));
        $output = '';
        $buf    = 0;
        $bits   = 0;
        for ($i = 0, $len = strlen($str); $i < $len; $i++) {
            $val   = strpos(self::ALPHABET, $str[$i]);
            if ($val === false) continue;
            $buf   = ($buf << 5) | $val;
            $bits += 5;
            if ($bits >= 8) {
                $bits  -= 8;
                $output .= chr(($buf >> $bits) & 0xff);
            }
        }
        return $output;
    }
}
