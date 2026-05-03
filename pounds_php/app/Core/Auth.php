<?php
namespace App\Core;

class Auth {
    private $db;
    private $jwtSecret;

    public function __construct() {
        $this->db = Database::getInstance();
        $this->jwtSecret = $_ENV['JWT_SECRET'] ?? '';
    }

    public function generateToken(array $user): string {
        $payload = [
            'sub' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'iat' => time(),
            'exp' => time() + (15 * 60) // 15 minutes
        ];

        $header = base64_encode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
        $payload = base64_encode(json_encode($payload));
        $signature = hash_hmac('sha256', "{$header}.{$payload}", $this->jwtSecret, true);
        $signature = base64_encode($signature);

        return "{$header}.{$payload}.{$signature}";
    }

    public function generateRefreshToken(array $user): string {
        $payload = [
            'sub' => $user['id'],
            'iat' => time(),
            'exp' => time() + (7 * 24 * 60 * 60) // 7 days
        ];

        $header = base64_encode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
        $payload = base64_encode(json_encode($payload));
        $signature = hash_hmac('sha256', "{$header}.{$payload}", $this->jwtSecret, true);
        $signature = base64_encode($signature);

        return "{$header}.{$payload}.{$signature}";
    }

    public function verifyToken(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        $header = $parts[0];
        $payload = $parts[1];
        $signature = $parts[2];

        $expectedSignature = base64_encode(
            hash_hmac('sha256', "{$header}.{$payload}", $this->jwtSecret, true)
        );

        if (!hash_equals($signature, $expectedSignature)) {
            return null;
        }

        $decoded = json_decode(base64_decode($payload), true);

        if ($decoded['exp'] < time()) {
            return null;
        }

        return $decoded;
    }

    public function login(string $email, string $password): ?array {
        $user = $this->db->fetch(
            "SELECT id, email, password, role, status, firstName, lastName, failedLoginAttempts, lockedUntil
             FROM users WHERE email = ?",
            [$email]
        );

        if (!$user) {
            return null;
        }

        // Check if account is locked
        if ($user['lockedUntil'] && strtotime($user['lockedUntil']) > time()) {
            return null;
        }

        if (!password_verify($password, $user['password'])) {
            // Increment failed attempts
            $attempts = ($user['failedLoginAttempts'] ?? 0) + 1;
            $lockUntil = $attempts >= 5 ? date('Y-m-d H:i:s', time() + 30 * 60) : null;

            $this->db->update(
                "UPDATE users SET failedLoginAttempts = ?, lockedUntil = ? WHERE id = ?",
                [$attempts, $lockUntil, $user['id']]
            );

            return null;
        }

        // Reset failed attempts on successful login
        $this->db->update(
            "UPDATE users SET failedLoginAttempts = 0, lockedUntil = NULL, lastLoginAt = NOW(), lastLoginIp = ? WHERE id = ?",
            [$_SERVER['REMOTE_ADDR'] ?? '', $user['id']]
        );

        unset($user['password']);
        return $user;
    }

    public function logout(string $token): bool {
        // Mark session as inactive
        $this->db->update(
            "UPDATE sessions SET isActive = 0 WHERE token = ?",
            [$token]
        );
        return true;
    }
}
