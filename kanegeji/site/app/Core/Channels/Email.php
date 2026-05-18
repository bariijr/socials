<?php

namespace App\Core\Channels;

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

class Email
{
    public static function send(string $to, string $toName, string $subject, string $body, array $options = []): bool
    {
        try {
            $mail = new PHPMailer(true);
            $mail->CharSet = 'UTF-8';
            $mail->isSMTP();
            $mail->Host       = env('MAIL_HOST', 'smtp.gmail.com');
            $mail->SMTPAuth   = true;
            $mail->Username   = env('MAIL_USERNAME', '');
            $mail->Password   = env('MAIL_PASSWORD', '');
            $mail->SMTPSecure = env('MAIL_ENCRYPTION', 'tls');
            $mail->Port       = (int) env('MAIL_PORT', 587);

            $mail->setFrom(env('MAIL_FROM_ADDRESS', ''), env('MAIL_FROM_NAME', config('app.name')));
            $mail->addAddress($to, $toName);

            foreach ($options['cc'] ?? [] as $cc) {
                $mail->addCC($cc);
            }
            foreach ($options['attachments'] ?? [] as $path => $name) {
                $mail->addAttachment($path, $name);
            }

            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body    = self::wrapInLayout($body, $subject);
            $mail->AltBody = strip_tags($body);

            $mail->send();
            return true;
        } catch (Exception $e) {
            error_log('Email send failed: ' . $e->getMessage());
            return false;
        }
    }

    private static function wrapInLayout(string $body, string $subject): string
    {
        $appName = htmlspecialchars(config('app.name', 'Parish ERP'));
        return "<!DOCTYPE html>
<html>
<head><meta charset='UTF-8'><style>
body{font-family:sans-serif;background:#f4f4f4;margin:0;padding:0}
.wrap{max-width:600px;margin:30px auto;background:#fff;border-radius:8px;overflow:hidden}
.hdr{background:#4F46E5;color:#fff;padding:20px 30px;font-size:18px;font-weight:bold}
.bdy{padding:30px;color:#333;line-height:1.6}
.ftr{background:#f8f8f8;padding:15px 30px;font-size:12px;color:#999;text-align:center}
</style></head>
<body><div class='wrap'>
<div class='hdr'>{$appName}</div>
<div class='bdy'>{$body}</div>
<div class='ftr'>Tuma na {$appName}. Barua hii imetumwa kiotomatiki.</div>
</div></body></html>";
    }
}
