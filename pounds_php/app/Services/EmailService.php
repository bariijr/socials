<?php
namespace App\Services;

class EmailService {
    private $smtp;

    public function __construct() {
        // PHPMailer would be instantiated here
        // For now, using simple mail() function
    }

    public function send(string $to, string $subject, string $body): bool {
        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-type: text/html; charset=UTF-8\r\n";
        $headers .= "From: " . ($_ENV['SMTP_FROM'] ?? 'noreply@pounds.mfi') . "\r\n";

        return mail($to, $subject, $body, $headers);
    }
}
