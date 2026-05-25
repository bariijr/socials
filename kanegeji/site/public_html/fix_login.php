<?php
/**
 * KANEGEJI LOGIN FIX — one-time script.
 * Fixes invalid password hash, clears rate-limiter, shows diagnostic info.
 *
 * 1. Upload this file to: public_html/kanegeji/public_html/fix_login.php
 * 2. Visit:  https://kanegeji.insider.co.tz/fix_login.php?pw=YourNewPassword
 * 3. DELETE this file immediately after use.
 */

define('BASE_PATH', dirname(__DIR__));

// ── Load .env manually (no autoloader needed) ────────────────────────────────
$envFile = BASE_PATH . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $_ENV[trim($k)] = trim($v, " \t\"'");
    }
}

$dbHost = $_ENV['DB_HOST'] ?? 'localhost';
$dbName = $_ENV['DB_NAME'] ?? '';
$dbUser = $_ENV['DB_USER'] ?? '';
$dbPass = $_ENV['DB_PASS'] ?? '';

header('Content-Type: text/html; charset=UTF-8');
echo '<pre style="font-family:monospace;padding:2rem;background:#0f172a;color:#e2e8f0;min-height:100vh">';

// ── Connect ───────────────────────────────────────────────────────────────────
try {
    $pdo = new PDO(
        "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4",
        $dbUser, $dbPass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    echo "<span style='color:#4ade80'>✓ DB connected</span>  ({$dbUser}@{$dbHost}/{$dbName})\n\n";
} catch (PDOException $e) {
    echo "<span style='color:#f87171'>✗ DB connection failed:</span> " . htmlspecialchars($e->getMessage()) . "\n";
    echo "  Check DB_HOST / DB_NAME / DB_USER / DB_PASS in .env\n";
    echo '</pre>';
    exit;
}

// ── Show current admin user ───────────────────────────────────────────────────
$user = $pdo->query(
    "SELECT id, email, password_hash, active, deleted_at FROM users WHERE role_id = 1 LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    echo "<span style='color:#f87171'>✗ No super_admin user found (role_id = 1).</span>\n";
    echo '</pre>';
    exit;
}

echo "Admin user:\n";
echo "  ID     : {$user['id']}\n";
echo "  Email  : {$user['email']}\n";
echo "  Active : " . ($user['active']
    ? 'yes'
    : '<span style="color:#f87171">NO — account disabled!</span>') . "\n";
echo "  Deleted: " . ($user['deleted_at']
    ? "<span style='color:#f87171'>{$user['deleted_at']}</span>"
    : 'no') . "\n";

$hashOk = strlen($user['password_hash']) === 60 && str_starts_with($user['password_hash'], '$2');
echo "  Hash   : " . ($hashOk
    ? "<span style='color:#4ade80'>valid bcrypt</span>"
    : "<span style='color:#f87171'>INVALID — this is why password_verify() fails for every password!</span>") . "\n\n";

// ── Reset password ────────────────────────────────────────────────────────────
$newPassword = trim($_GET['pw'] ?? '');
if ($newPassword === '') {
    $newPassword = 'Admin@' . date('Y') . '!';
}

if (strlen($newPassword) < 8) {
    echo "<span style='color:#f87171'>Password must be ≥ 8 characters. Add ?pw=YourPassword to the URL.</span>\n";
} else {
    $hash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
    $stmt = $pdo->prepare(
        "UPDATE users SET password_hash = ?, active = 1, deleted_at = NULL WHERE id = ?"
    );
    $stmt->execute([$hash, $user['id']]);
    echo "Password reset:\n";
    echo "  New password : <span style='color:#facc15'>" . htmlspecialchars($newPassword) . "</span>\n";
    echo "  Rows updated : {$stmt->rowCount()}\n\n";
}

// ── Clear rate-limit files ────────────────────────────────────────────────────
$cacheDir = BASE_PATH . '/storage/cache';
$cleared  = 0;
if (is_dir($cacheDir)) {
    foreach (glob($cacheDir . '/rl_*.json') as $f) {
        unlink($f);
        $cleared++;
    }
}
echo "Rate limiter: <span style='color:#4ade80'>cleared {$cleared} file(s)</span>\n\n";

// ── Check session save path ───────────────────────────────────────────────────
$sessionPath = session_save_path() ?: sys_get_temp_dir();
$sessionOk   = is_dir($sessionPath) && is_writable($sessionPath);
echo "Sessions:\n";
echo "  Save path : {$sessionPath}\n";
echo "  Writable  : " . ($sessionOk
    ? "<span style='color:#4ade80'>yes</span>"
    : "<span style='color:#f87171'>NO — sessions cannot be saved! This breaks login entirely.</span>") . "\n\n";

// ── Summary ───────────────────────────────────────────────────────────────────
echo "─────────────────────────────────────────────────────────\n";
echo "Login now with:\n";
echo "  URL      : https://kanegeji.insider.co.tz/login\n";
echo "  Email    : {$user['email']}\n";
echo "  Password : <span style='color:#facc15'>" . htmlspecialchars($newPassword) . "</span>\n\n";
echo "<span style='color:#f87171;font-weight:bold'>DELETE this file from the server immediately after use!</span>\n";
echo "Path: " . __FILE__ . "\n";
echo '</pre>';
