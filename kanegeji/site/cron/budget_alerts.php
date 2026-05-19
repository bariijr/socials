<?php

/**
 * Budget overage alerts — run 1st of each month at 07:00
 * Usage: php cron/budget_alerts.php
 */

declare(strict_types=1);
define('BASE_PATH', dirname(__DIR__));

require BASE_PATH . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(BASE_PATH);
$dotenv->safeLoad();

$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4',
        $_ENV['DB_HOST'] ?? 'localhost',
        $_ENV['DB_NAME'] ?? ''),
    $_ENV['DB_USER'] ?? '',
    $_ENV['DB_PASS'] ?? '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$year  = (int) date('Y');
$month = (int) date('m');
$alerts = 0;

// Budget lines where actual spending ≥ 90% of budgeted amount
$stmt = $pdo->prepare(
    "SELECT b.id, b.name, b.budgeted_amount, b.parish_id,
            COALESCE(SUM(t.amount),0) as actual_spent,
            par.name as parish_name
     FROM budgets b
     JOIN parishes par ON par.id = b.parish_id
     LEFT JOIN transactions t ON t.parish_id = b.parish_id
          AND t.category_id = b.category_id
          AND t.type = 'expense'
          AND t.status = 'approved'
          AND YEAR(t.transaction_date) = ?
          AND MONTH(t.transaction_date) = ?
          AND t.deleted_at IS NULL
     WHERE b.year = ? AND b.deleted_at IS NULL
     GROUP BY b.id
     HAVING actual_spent >= b.budgeted_amount * 0.90"
);
$stmt->execute([$year, $month, $year]);
$overages = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($overages as $row) {
    $pct = $row['budgeted_amount'] > 0
        ? round($row['actual_spent'] / $row['budgeted_amount'] * 100)
        : 100;
    $currency = $_ENV['PARISH_CURRENCY'] ?? 'TZS';

    // Notify all chairmen and accountants for this parish
    $admins = $pdo->prepare(
        "SELECT name, email FROM users
         WHERE parish_id=? AND role IN ('chairman','accountant') AND active=1 AND deleted_at IS NULL"
    );
    $admins->execute([$row['parish_id']]);
    $recipients = $admins->fetchAll(PDO::FETCH_ASSOC);

    foreach ($recipients as $admin) {
        if (!$admin['email']) continue;

        $html = "<p>Ndugu <strong>{$admin['name']}</strong>,</p>
                 <p>Bajeti ya <strong>{$row['name']}</strong> kwa mwezi huu imefika <strong>{$pct}%</strong> ya kiasi kilichopangwa.</p>
                 <ul>
                   <li>Kiasi kilichopangwa: " . number_format($row['budgeted_amount']) . " {$currency}</li>
                   <li>Kiasi kilichotumika: " . number_format($row['actual_spent']) . " {$currency}</li>
                 </ul>
                 <p>Tafadhali kagua matumizi ili kuzuia kuzidi bajeti.</p>
                 <p>— {$row['parish_name']}</p>";

        try {
            \App\Core\Channels\Email::send(
                $admin['email'],
                $admin['name'],
                "Tahadhari ya Bajeti — {$row['name']} ({$pct}%)",
                $html
            );
            $alerts++;
        } catch (\Throwable $e) {
            error_log("[budget_alerts] Email failed: " . $e->getMessage());
        }
    }
}

$ts = date('Y-m-d H:i:s');
echo "[{$ts}] Budget alerts: {$alerts} emails sent, " . count($overages) . " budget lines checked.\n";
