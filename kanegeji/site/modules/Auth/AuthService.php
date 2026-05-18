<?php

namespace App\Modules\Auth;

use App\Core\{Database, RateLimit};

class AuthService
{
    public function attemptLogin(string $email, string $password, string $ip): array
    {
        $cfg      = config('app.rate_limit');
        $rateKey  = "login:{$ip}";

        if (!RateLimit::check($rateKey, $cfg['login_max'], $cfg['login_window'])) {
            return ['success' => false, 'reason' => 'locked'];
        }

        $user = Database::selectOne(
            "SELECT u.*, r.slug AS role_slug
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.email = ? AND u.deleted_at IS NULL LIMIT 1",
            [$email]
        );

        if (!$user || !password_verify($password, $user['password_hash'])) {
            return ['success' => false, 'reason' => 'invalid'];
        }

        if (!$user['active']) {
            return ['success' => false, 'reason' => 'inactive'];
        }

        RateLimit::clear($rateKey);
        Database::execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [$user['id']]);

        return ['success' => true, 'user' => $user];
    }

    public function getUserByEmail(string $email): array|false
    {
        return Database::selectOne(
            "SELECT u.*, r.slug AS role_slug FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ? LIMIT 1",
            [$email]
        );
    }

    public function setResetToken(int $userId, string $token): void
    {
        Database::execute(
            "UPDATE users SET password_reset_token = ?, password_reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?",
            [$token, $userId]
        );
    }

    public function getUserByResetToken(string $token): array|false
    {
        return Database::selectOne(
            "SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires > NOW() AND deleted_at IS NULL LIMIT 1",
            [$token]
        );
    }

    public function resetPassword(int $userId, string $newPassword): void
    {
        Database::execute(
            "UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?",
            [password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]), $userId]
        );
    }
}
