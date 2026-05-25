<?php
/**
 * ONE-TIME admin password reset utility.
 * Upload to the server, visit it once in the browser, then DELETE IT.
 *
 * Usage (browser):
 *   https://kanegeji.insider.co.tz/database/reset_admin_password.php
 *   https://kanegeji.insider.co.tz/database/reset_admin_password.php?pw=YourNewPassword123
 *
 * Usage (CLI):
 *   php database/reset_admin_password.php "YourNewPassword123"
 */

define('BASE_PATH', dirname(__DIR__));

$dotenv = class_exists('Dotenv\Dotenv')
    ? Dotenv\Dotenv::createImmutable(BASE_PATH)
    : null;

if ($dotenv) {
    $dotenv->safeLoad();
} else {
    // Minimal .env reader fallback
    $envFile = BASE_PATH . '/.env';
    if (file_exists($envFile)) {
        foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
            [$k, $v] = explode('=', $line, 2);
            $_ENV[trim($k)] = trim($v, " \t\n\r\0\x0B\"'");
        }
    }
}

$isCli = PHP_SAPI === 'cli';

// ── Determine new password ────────────────────────────────────────────────────
$newPassword = $isCli
    ? ($argv[1] ?? 'Admin@2025!')
    : ($_GET['pw'] ?? 'Admin@2025!');

if (strlen($newPassword) < 8) {
    die("Password must be at least 8 characters.\n");
}

// ── Connect ───────────────────────────────────────────────────────────────────
$dbHost = $_ENV['DB_HOST'] ?? 'localhost';
$dbName = $_ENV['DB_NAME'] ?? '';
$dbUser = $_ENV['DB_USER'] ?? '';
$dbPass = $_ENV['DB_PASS'] ?? '';

try {
    $pdo = new PDO(
        "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4",
        $dbUser,
        $dbPass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    die("DB connection failed: " . $e->getMessage() . "\n");
}

// ── Hash & update ─────────────────────────────────────────────────────────────
$hash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);

$stmt = $pdo->prepare(
    "UPDATE users SET password_hash = ? WHERE role_id = 1 AND deleted_at IS NULL LIMIT 1"
);
$stmt->execute([$hash]);
$affected = $stmt->rowCount();

// ── Report ────────────────────────────────────────────────────────────────────
$row   = $pdo->query("SELECT email FROM users WHERE role_id = 1 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$email = $row['email'] ?? '(unknown)';

if ($isCli) {
    echo "Updated {$affected} user(s).\n";
    echo "Email   : {$email}\n";
    echo "Password: {$newPassword}\n";
    echo "Hash    : {$hash}\n";
    echo "\nDelete this script after use: rm database/reset_admin_password.php\n";
} else {
    header('Content-Type: text/html; charset=UTF-8');
    echo "<pre style='font-family:monospace;padding:2rem;background:#f0fdf4;border:1px solid #86efac;border-radius:.5rem'>";
    echo "Updated {$affected} user(s).\n";
    echo "Email   : " . htmlspecialchars($email) . "\n";
    echo "Password: " . htmlspecialchars($newPassword) . "\n";
    echo "\n<strong style='color:#dc2626'>DELETE this file from the server immediately after use!</strong>\n";
    echo "Path: " . __FILE__ . "\n";
    echo "</pre>";
}
