<?php

namespace App\Core;

use App\Core\Channels\WhatsApp;
use App\Core\Channels\SMS;
use App\Core\Channels\Email;

class Notification
{
    /**
     * Send via WhatsApp → SMS → Email priority order.
     * Logs result to notification_logs table.
     */
    public static function send(
        int    $parishId,
        string $recipientPhone,
        string $recipientEmail,
        string $recipientName,
        string $type,
        string $subject,
        string $message,
        int    $relatedId = 0,
        string $relatedType = ''
    ): bool {
        $sent    = false;
        $channel = 'none';

        if ($recipientPhone && env('WA_ACCOUNT_SID')) {
            if (WhatsApp::send($recipientPhone, $message)) {
                $sent    = true;
                $channel = 'whatsapp';
            }
        }

        if (!$sent && $recipientPhone && env('AT_API_KEY')) {
            if (SMS::send($recipientPhone, $message)) {
                $sent    = true;
                $channel = 'sms';
            }
        }

        if (!$sent && $recipientEmail) {
            if (Email::send($recipientEmail, $recipientName, $subject, nl2br(e($message)))) {
                $sent    = true;
                $channel = 'email';
            }
        }

        Database::execute(
            "INSERT INTO notification_logs
             (parish_id, recipient_name, recipient_phone, recipient_email,
              notification_type, channel, subject, message, status, related_id, related_type, sent_at, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())",
            [
                $parishId,
                $recipientName,
                $recipientPhone,
                $recipientEmail,
                $type,
                $channel,
                $subject,
                $message,
                $sent ? 'sent' : 'failed',
                $relatedId,
                $relatedType,
                $sent ? date('Y-m-d H:i:s') : null,
            ]
        );

        return $sent;
    }

    public static function sendToUser(array $user, string $type, string $subject, string $message): bool
    {
        return self::send(
            $user['parish_id'],
            $user['phone'] ?? '',
            $user['email'] ?? '',
            ($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''),
            $type,
            $subject,
            $message
        );
    }
}
