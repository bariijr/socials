<?php

/**
 * Pledge payment reminders — run weekly (e.g. every Friday 08:00)
 * Usage: php cron/pledge_reminders.php
 */

declare(strict_types=1);
define('BASE_PATH', dirname(__DIR__));

require BASE_PATH . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(BASE_PATH);
$dotenv->safeLoad();

// Standalone PDO (no framework session/auth needed)
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4',
        $_ENV['DB_HOST'] ?? 'localhost',
        $_ENV['DB_NAME'] ?? ''),
    $_ENV['DB_USER'] ?? '',
    $_ENV['DB_PASS'] ?? '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$sent = 0;
$errors = 0;

// Find pledges due within 7 days with remaining balance
$stmt = $pdo->query(
    "SELECT p.id, p.amount_pledged, p.amount_paid, p.due_date,
            m.first_name, m.last_name, m.phone, m.email,
            c.title as campaign_title,
            par.name as parish_name
     FROM pledges p
     JOIN members m ON m.id = p.member_id
     JOIN campaigns c ON c.id = p.campaign_id
     JOIN parishes par ON par.id = p.parish_id
     WHERE p.amount_paid < p.amount_pledged
       AND p.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
       AND m.deleted_at IS NULL
       AND p.deleted_at IS NULL"
);

$pledges = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($pledges as $pledge) {
    $remaining = $pledge['amount_pledged'] - $pledge['amount_paid'];
    $currency  = $_ENV['PARISH_CURRENCY'] ?? 'TZS';
    $name      = $pledge['first_name'] . ' ' . $pledge['last_name'];
    $message   = "Ndugu {$name}, ahadi yako ya " . number_format($remaining) . " {$currency} "
               . "kwa kampeni '{$pledge['campaign_title']}' inakaribia tarehe ya mwisho "
               . "({$pledge['due_date']}). Tafadhali fanya malipo. — {$pledge['parish_name']}";

    // SMS
    if (!empty($pledge['phone'])) {
        try {
            \App\Core\Channels\SMS::send($pledge['phone'], $message);
            $sent++;
        } catch (\Throwable $e) {
            $errors++;
            error_log("[pledge_reminders] SMS failed for pledge {$pledge['id']}: " . $e->getMessage());
        }
    }

    // Email
    if (!empty($pledge['email'])) {
        $html = "<p>Ndugu <strong>{$name}</strong>,</p>
                 <p>Ahadi yako ya <strong>" . number_format($remaining) . " {$currency}</strong>
                 kwa kampeni <em>{$pledge['campaign_title']}</em> inakaribia tarehe ya mwisho:
                 <strong>{$pledge['due_date']}</strong>.</p>
                 <p>Tafadhali fanya malipo mapema iwezekanavyo.</p>
                 <p>Asante — {$pledge['parish_name']}</p>";
        try {
            \App\Core\Channels\Email::send(
                $pledge['email'],
                $name,
                "Kumbukumbu ya Ahadi — {$pledge['campaign_title']}",
                $html
            );
            $sent++;
        } catch (\Throwable $e) {
            $errors++;
            error_log("[pledge_reminders] Email failed for pledge {$pledge['id']}: " . $e->getMessage());
        }
    }
}

$ts = date('Y-m-d H:i:s');
echo "[{$ts}] Pledge reminders: {$sent} sent, {$errors} errors, " . count($pledges) . " pledges processed.\n";
