<?php

/**
 * Database backup — run daily at 02:00
 * Usage: php cron/backup.php
 * Saves gzipped SQL dumps to storage/backups/, retains last 30 days.
 */

declare(strict_types=1);
define('BASE_PATH', dirname(__DIR__));

require BASE_PATH . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(BASE_PATH);
$dotenv->safeLoad();

$host      = $_ENV['DB_HOST'] ?? 'localhost';
$dbName    = $_ENV['DB_NAME'] ?? 'kanegeji_erp';
$user      = $_ENV['DB_USER'] ?? '';
$pass      = $_ENV['DB_PASS'] ?? '';
$backupDir = BASE_PATH . '/storage/backups';
$retention = (int) ($_ENV['BACKUP_RETENTION_DAYS'] ?? 30);

if (!is_dir($backupDir)) {
    mkdir($backupDir, 0755, true);
}

$filename  = $backupDir . '/kanegeji_' . date('Y-m-d_His') . '.sql.gz';
$mysqldump = 'mysqldump';

// Build command — password passed via env variable to avoid shell history exposure
$cmd = sprintf(
    'MYSQL_PWD=%s %s --host=%s --user=%s --single-transaction --routines --triggers %s | gzip > %s',
    escapeshellarg($pass),
    escapeshellarg($mysqldump),
    escapeshellarg($host),
    escapeshellarg($user),
    escapeshellarg($dbName),
    escapeshellarg($filename)
);

exec($cmd, $output, $exitCode);

if ($exitCode !== 0) {
    $ts = date('Y-m-d H:i:s');
    echo "[{$ts}] BACKUP FAILED (exit code {$exitCode})\n";
    exit(1);
}

$sizeMb = round(filesize($filename) / 1048576, 2);
$ts = date('Y-m-d H:i:s');
echo "[{$ts}] Backup saved: {$filename} ({$sizeMb} MB)\n";

// Prune old backups
$cutoff = time() - ($retention * 86400);
$pruned = 0;
foreach (glob($backupDir . '/kanegeji_*.sql.gz') as $old) {
    if (filemtime($old) < $cutoff) {
        unlink($old);
        $pruned++;
    }
}

if ($pruned > 0) {
    echo "[{$ts}] Pruned {$pruned} backups older than {$retention} days.\n";
}

// Optional: send backup notification email
$backupEmail = $_ENV['BACKUP_EMAIL'] ?? '';
if ($backupEmail) {
    $html = "<p>Hifadhi ya hifadhidata imekamilika.</p>
             <ul>
               <li>Faili: " . basename($filename) . "</li>
               <li>Ukubwa: {$sizeMb} MB</li>
               <li>Tarehe: {$ts}</li>
             </ul>";
    try {
        \App\Core\Channels\Email::send(
            $backupEmail,
            'Admin',
            'Hifadhi ya Hifadhidata — ' . date('Y-m-d'),
            $html
        );
    } catch (\Throwable $e) {
        error_log('[backup] Email notification failed: ' . $e->getMessage());
    }
}
