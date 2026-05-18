<?php

namespace App\Core;

class Auth
{
    public static function check(): bool
    {
        return Session::has('user');
    }

    public static function user(): array|null
    {
        return Session::get('user');
    }

    public static function id(): int|null
    {
        return Session::get('user')['id'] ?? null;
    }

    public static function role(): string|null
    {
        return Session::get('user')['role_slug'] ?? null;
    }

    public static function parishId(): int
    {
        return Session::get('user')['parish_id'] ?? config('app.parish_id');
    }

    public static function isSuperAdmin(): bool
    {
        return self::role() === 'super_admin';
    }

    public static function can(string $permission): bool
    {
        if (self::isSuperAdmin()) {
            return true;
        }

        $role  = self::role();
        $perms = config('permissions')[$role] ?? [];
        return in_array($permission, $perms, true);
    }

    public static function requireLogin(): void
    {
        if (!self::check()) {
            Session::flash('error', __('auth.login_required', 'Tafadhali ingia kwanza.'));
            redirect('/login');
        }
    }

    public static function requirePermission(string $permission): void
    {
        self::requireLogin();
        if (!self::can($permission)) {
            http_response_code(403);
            require BASE_PATH . '/public_html/views/errors/403.php';
            exit;
        }
    }

    public static function login(array $user): void
    {
        Session::regenerate();
        Session::set('user', [
            'id'        => $user['id'],
            'name'      => $user['name'],
            'email'     => $user['email'],
            'role_id'   => $user['role_id'],
            'role_slug' => $user['role_slug'],
            'parish_id' => $user['parish_id'],
            'lang'      => $user['lang'],
            'avatar'    => $user['avatar_path'] ?? null,
        ]);
    }

    public static function logout(): void
    {
        Session::destroy();
    }
}
