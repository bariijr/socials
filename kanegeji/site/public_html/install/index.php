<?php
/**
 * Kanegeji Parish ERP — Web Installer
 * DELETE this directory after installation.
 */

define('BASE_PATH', dirname(dirname(dirname(__DIR__))));
define('LOCK_FILE', BASE_PATH . '/.installed');

// Already installed guard
if (file_exists(LOCK_FILE)) {
    header('Location: /');
    exit;
}

// Vendor check
if (!file_exists(BASE_PATH . '/vendor/autoload.php')) {
    die('<h2 style="font-family:sans-serif;color:#dc2626">Run <code>composer install</code> before using the installer.</h2>');
}

$step   = (int) ($_GET['step'] ?? 1);
$errors = [];
$info   = [];

// ── Requirements ──────────────────────────────────────────────
$reqs = [
    'PHP ≥ 8.3'         => PHP_VERSION_ID >= 80300,
    'pdo_mysql'         => extension_loaded('pdo_mysql'),
    'mbstring'          => extension_loaded('mbstring'),
    'gd'                => extension_loaded('gd') || extension_loaded('imagick'),
    'curl'              => extension_loaded('curl'),
    'fileinfo'          => extension_loaded('fileinfo'),
    'zip'               => extension_loaded('zip'),
    'storage/ writable' => is_writable(BASE_PATH . '/storage'),
];
$allOk = !in_array(false, $reqs, true);

// ── Helpers ───────────────────────────────────────────────────
function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

function runMigration(PDO $pdo, string $file): void
{
    $sql = file_get_contents($file);
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
        if ($stmt) $pdo->exec($stmt);
    }
}

// ── Step 3: Admin creation ────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $step === 3) {
    // Retrieve DB config from session
    session_start();
    $cfg = $_SESSION['install_db'] ?? null;
    if (!$cfg) { header('Location: ?step=2'); exit; }

    $adminName  = trim($_POST['admin_name'] ?? '');
    $adminEmail = strtolower(trim($_POST['admin_email'] ?? ''));
    $adminPass  = $_POST['admin_password'] ?? '';
    $parishName = trim($_POST['parish_name'] ?? '');
    $appUrl     = rtrim(trim($_POST['app_url'] ?? ''), '/');

    if (!$adminName || !$adminEmail || strlen($adminPass) < 8 || !$parishName) {
        $errors[] = 'Jaza sehemu zote. Nywila lazima iwe na herufi 8 au zaidi.';
    }

    if (empty($errors)) {
        try {
            $pdo = new PDO(
                "mysql:host={$cfg['host']};dbname={$cfg['name']};charset=utf8mb4",
                $cfg['user'], $cfg['pass'],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );

            // Run all migrations
            foreach (glob(BASE_PATH . '/database/migrations/*.sql') as $file) {
                runMigration($pdo, $file);
            }

            // Create first parish
            $pdo->prepare(
                "INSERT IGNORE INTO parishes (id, name, active, created_at) VALUES (1, ?, 1, NOW())"
            )->execute([$parishName]);

            // Create super_admin user
            $hash = password_hash($adminPass, PASSWORD_BCRYPT, ['cost' => 12]);
            $pdo->prepare(
                "INSERT INTO users (parish_id, name, email, password, role, active, created_at)
                 VALUES (1, ?, ?, ?, 'super_admin', 1, NOW())
                 ON DUPLICATE KEY UPDATE role='super_admin', active=1"
            )->execute([$adminName, $adminEmail, $hash]);

            // Write .env file
            $envExample = file_get_contents(BASE_PATH . '/.env.example');
            $appKey = bin2hex(random_bytes(32));
            $env = preg_replace([
                '/^APP_KEY=.*/m', '/^APP_URL=.*/m', '/^APP_DEBUG=.*/m',
                '/^DB_HOST=.*/m', '/^DB_NAME=.*/m', '/^DB_USER=.*/m', '/^DB_PASS=.*/m',
            ], [
                'APP_KEY=' . $appKey,
                'APP_URL=' . $appUrl,
                'APP_DEBUG=false',
                'DB_HOST=' . $cfg['host'],
                'DB_NAME=' . $cfg['name'],
                'DB_USER=' . $cfg['user'],
                'DB_PASS=' . $cfg['pass'],
            ], $envExample);
            file_put_contents(BASE_PATH . '/.env', $env);

            // Write lock file
            file_put_contents(LOCK_FILE, date('Y-m-d H:i:s'));

            // Clear session
            session_destroy();

            $step = 4; // Success
        } catch (\Throwable $e) {
            $errors[] = 'Hitilafu: ' . $e->getMessage();
        }
    }
}

// ── Step 2: DB config ─────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $step === 2) {
    session_start();
    $host = trim($_POST['db_host'] ?? 'localhost');
    $name = trim($_POST['db_name'] ?? '');
    $user = trim($_POST['db_user'] ?? '');
    $pass = $_POST['db_pass'] ?? '';

    if (!$name || !$user) {
        $errors[] = 'Jaza jina la hifadhidata na mtumiaji.';
    } else {
        try {
            $pdo = new PDO(
                "mysql:host={$host};dbname={$name};charset=utf8mb4",
                $user, $pass,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]
            );
            $pdo->query('SELECT 1');
            $_SESSION['install_db'] = compact('host', 'name', 'user', 'pass');
            header('Location: ?step=3');
            exit;
        } catch (\PDOException $e) {
            $errors[] = 'Hifadhidata: ' . $e->getMessage();
        }
    }
}

?><!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sakinisha — Parish ERP</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
<div class="w-full max-w-lg">
    <!-- Header -->
    <div class="text-center mb-8">
        <div class="w-16 h-16 rounded-2xl bg-purple-700 flex items-center justify-center mx-auto mb-3">
            <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900">Kanegeji Parish ERP</h1>
        <p class="text-gray-500 text-sm mt-1">Mchakato wa Usanikishaji</p>
    </div>

    <!-- Steps -->
    <div class="flex justify-center gap-3 mb-8">
        <?php foreach ([1=>'Mahitaji',2=>'Hifadhidata',3=>'Msimamizi',4=>'Imekamilika'] as $n => $label): ?>
        <div class="flex items-center gap-1">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                <?= $step >= $n ? 'bg-purple-700 text-white' : 'bg-gray-200 text-gray-500' ?>">
                <?= $step > $n ? '✓' : $n ?>
            </div>
            <span class="text-xs text-gray-500 hidden sm:block"><?= $label ?></span>
        </div>
        <?php if ($n < 4): ?><div class="w-8 h-px bg-gray-300 self-center"></div><?php endif; ?>
        <?php endforeach; ?>
    </div>

    <?php if (!empty($errors)): ?>
    <div class="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
        <?php foreach ($errors as $e): ?><p>• <?= h($e) ?></p><?php endforeach; ?>
    </div>
    <?php endif; ?>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

    <?php if ($step === 1): ?>
    <!-- Step 1: Requirements -->
    <h2 class="font-bold text-gray-900 mb-4">Ukaguzi wa Mahitaji</h2>
    <div class="space-y-2 mb-6">
        <?php foreach ($reqs as $name => $ok): ?>
        <div class="flex items-center justify-between py-2 border-b border-gray-50">
            <span class="text-sm text-gray-700"><?= h($name) ?></span>
            <?php if ($ok): ?>
                <span class="text-green-600 text-sm font-medium">✓ Sawa</span>
            <?php else: ?>
                <span class="text-red-600 text-sm font-medium">✗ Haipo</span>
            <?php endif; ?>
        </div>
        <?php endforeach; ?>
    </div>

    <?php if ($allOk): ?>
        <a href="?step=2" class="block w-full text-center bg-purple-700 text-white py-2.5 rounded-xl font-medium hover:bg-purple-800">Endelea →</a>
    <?php else: ?>
        <p class="text-sm text-red-600 mb-3">Rekebisha mahitaji yaliyokosekana kisha onyesha upya ukurasa huu.</p>
        <button onclick="location.reload()" class="block w-full text-center bg-gray-200 text-gray-700 py-2.5 rounded-xl font-medium">Jaribu Tena</button>
    <?php endif; ?>

    <?php elseif ($step === 2): ?>
    <!-- Step 2: Database -->
    <h2 class="font-bold text-gray-900 mb-4">Usanidi wa Hifadhidata</h2>
    <form method="POST" action="?step=2" class="space-y-4">
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Seva ya Hifadhidata</label>
            <input type="text" name="db_host" value="localhost" required
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Jina la Hifadhidata</label>
            <input type="text" name="db_name" placeholder="kanegeji_erp" required
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Mtumiaji wa Hifadhidata</label>
            <input type="text" name="db_user" required
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nywila ya Hifadhidata</label>
            <input type="password" name="db_pass"
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
        </div>
        <button type="submit" class="w-full bg-purple-700 text-white py-2.5 rounded-xl font-medium hover:bg-purple-800">
            Jaribu Muunganiko →
        </button>
    </form>

    <?php elseif ($step === 3): ?>
    <!-- Step 3: Admin user -->
    <h2 class="font-bold text-gray-900 mb-4">Akaunti ya Msimamizi</h2>
    <form method="POST" action="?step=3" class="space-y-4">
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Jina la Parokia</label>
            <input type="text" name="parish_name" placeholder="Parokia ya Kanegeji" required
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">URL ya Mfumo</label>
            <input type="url" name="app_url" placeholder="https://yourdomain.com" required
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
        </div>
        <hr class="border-gray-100">
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Jina la Msimamizi</label>
            <input type="text" name="admin_name" required
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Barua Pepe ya Msimamizi</label>
            <input type="email" name="admin_email" required
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nywila (herufi 8+)</label>
            <input type="password" name="admin_password" minlength="8" required
                   class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
        </div>
        <button type="submit" class="w-full bg-purple-700 text-white py-2.5 rounded-xl font-medium hover:bg-purple-800">
            Sakinisha Sasa
        </button>
    </form>

    <?php elseif ($step === 4): ?>
    <!-- Step 4: Success -->
    <div class="text-center py-4">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
        </div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">Imesanikishwa!</h2>
        <p class="text-gray-500 text-sm mb-6">Mfumo wa Parokia umesakinishwa kwa mafanikio.</p>

        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-left mb-6">
            <p class="font-semibold mb-1">Hatua za Usalama:</p>
            <ol class="list-decimal list-inside space-y-1">
                <li>Futa saraka hii: <code class="bg-amber-100 px-1 rounded">public_html/install/</code></li>
                <li>Hakikisha faili ya <code class="bg-amber-100 px-1 rounded">.env</code> ina maadili sahihi</li>
                <li>Weka <code class="bg-amber-100 px-1 rounded">APP_DEBUG=false</code></li>
            </ol>
        </div>

        <a href="/login" class="block w-full text-center bg-purple-700 text-white py-2.5 rounded-xl font-medium hover:bg-purple-800">
            Nenda Kwenye Mfumo →
        </a>
    </div>
    <?php endif; ?>

    </div>
</div>
</body>
</html>
