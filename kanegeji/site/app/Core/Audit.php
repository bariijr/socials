<?php

namespace App\Core;

class Audit
{
    public static function log(
        string $action,
        string $module,
        string $entityType = '',
        int    $entityId   = 0,
        array  $oldValues  = [],
        array  $newValues  = []
    ): void {
        $user = Auth::user();
        Database::execute(
            "INSERT INTO audit_logs
                (parish_id, user_id, user_name, action, module, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                Auth::parishId(),
                $user['id'] ?? null,
                $user['name'] ?? 'System',
                $action,
                $module,
                $entityType ?: null,
                $entityId ?: null,
                $oldValues ? json_encode($oldValues) : null,
                $newValues ? json_encode($newValues) : null,
                Request::ip(),
                Request::userAgent(),
            ]
        );
    }

    public static function logLogin(string $email, string $status, string $reason = ''): void
    {
        Database::execute(
            "INSERT INTO login_logs (parish_id, user_id, email, ip_address, user_agent, status, reason)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                config('app.parish_id'),
                Auth::id(),
                $email,
                Request::ip(),
                Request::userAgent(),
                $status,
                $reason ?: null,
            ]
        );
    }
}
