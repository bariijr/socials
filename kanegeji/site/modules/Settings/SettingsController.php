<?php

namespace App\Modules\Settings;

use App\Core\{Audit, Auth, Controller, Database, Request, Session, TOTP};
use chillerlan\QRCode\{QRCode, QROptions};

class SettingsController extends Controller
{
    public function index(): void
    {
        $this->requirePermission('settings.manage');

        $settings = Database::select(
            "SELECT * FROM settings WHERE parish_id = ? ORDER BY `key`",
            [Auth::parishId()]
        );

        $parish = Database::selectOne("SELECT * FROM parishes WHERE id = ?", [Auth::parishId()]);

        $this->view('Settings/views/index', [
            'pageTitle' => __('settings.title', 'Mipangilio'),
            'settings'  => $settings,
            'parish'    => $parish,
        ]);
    }

    public function update(): void
    {
        $this->requirePermission('settings.manage');
        $this->verifyCsrf();

        $pid = Auth::parishId();

        // Update parish info
        Database::execute(
            "UPDATE parishes SET name=?, phone=?, email=?, address=? WHERE id=?",
            [
                Request::sanitize('parish_name'),
                Request::sanitize('parish_phone'),
                Request::sanitize('parish_email'),
                Request::sanitize('parish_address'),
                $pid,
            ]
        );

        Audit::log('settings.update', 'Settings');
        Session::flash('success', 'Mipangilio imehifadhiwa.');
        $this->redirect('/settings');
    }

    public function profile(): void
    {
        $this->requireAuth();
        $user = Database::selectOne("SELECT * FROM users WHERE id = ?", [Auth::id()]);
        $this->view('Settings/views/profile', [
            'pageTitle' => __('settings.profile', 'Wasifu Wangu'),
            'user'      => $user,
        ]);
    }

    public function updateProfile(): void
    {
        $this->requireAuth();
        $this->verifyCsrf();

        $userId  = Auth::id();
        $name    = Request::sanitize('name');
        $lang    = Request::input('lang', 'sw');
        $current = Request::post('current_password', '');
        $new     = Request::post('new_password', '');
        $confirm = Request::post('confirm_password', '');

        Database::execute("UPDATE users SET name=?, lang=? WHERE id=?", [$name, $lang, $userId]);

        if ($current && $new) {
            $user = Database::selectOne("SELECT password_hash FROM users WHERE id=?", [$userId]);
            if (!password_verify($current, $user['password_hash'])) {
                Session::flash('error', 'Nywila ya sasa si sahihi.');
                $this->redirect('/settings/profile');
            }
            if (strlen($new) < 8 || $new !== $confirm) {
                Session::flash('error', 'Nywila mpya lazima iwe na herufi 8+ na zilingane.');
                $this->redirect('/settings/profile');
            }
            Database::execute(
                "UPDATE users SET password_hash=? WHERE id=?",
                [password_hash($new, PASSWORD_BCRYPT, ['cost' => 12]), $userId]
            );
        }

        // Update session user
        $updated = Database::selectOne("SELECT u.*, r.slug as role_slug FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id=?", [$userId]);
        Auth::login($updated);

        Audit::log('profile.update', 'Settings', 'user', $userId);
        Session::flash('success', 'Wasifu umesasishwa.');
        $this->redirect('/settings/profile');
    }

    // ── Security / 2FA / Web Push ─────────────────────────────

    public function security(): void
    {
        $this->requireAuth();
        $userId = Auth::id();

        $totpRecord    = Database::selectOne("SELECT enabled FROM totp_secrets WHERE user_id=?", [$userId]);
        $totpEnabled   = $totpRecord && $totpRecord['enabled'];
        $pendingSecret = $_SESSION['totp_pending_secret'] ?? null;
        $qrCodeUrl     = null;

        if ($pendingSecret && !$totpEnabled) {
            $u   = Database::selectOne("SELECT email FROM users WHERE id=?", [$userId]);
            $uri = TOTP::getUri($pendingSecret, $u['email'], env('APP_NAME', 'Parish ERP'));
            $opts = new QROptions;
            $opts->outputType = 'svg';
            $opts->returnType = 'string';
            $svg       = (new QRCode($opts))->render($uri);
            $qrCodeUrl = 'data:image/svg+xml;base64,' . base64_encode($svg);
        }

        $backupCodes = $_SESSION['totp_backup_codes'] ?? null;
        unset($_SESSION['totp_backup_codes']);

        $pushEnabled = (bool) Database::selectOne(
            "SELECT id FROM push_subscriptions WHERE user_id=? LIMIT 1",
            [$userId]
        );

        $this->view('Settings/views/security', [
            'pageTitle'     => 'Usalama wa Akaunti',
            'totpEnabled'   => $totpEnabled,
            'pendingSecret' => $pendingSecret,
            'qrCodeUrl'     => $qrCodeUrl,
            'backupCodes'   => $backupCodes,
            'pushEnabled'   => $pushEnabled,
        ]);
    }

    public function totpSetup(): void
    {
        $this->requireAuth();
        $this->verifyCsrf();

        $_SESSION['totp_pending_secret'] = TOTP::generateSecret();
        $this->redirect('/settings/security');
    }

    public function totpConfirm(): void
    {
        $this->requireAuth();
        $this->verifyCsrf();

        $secret = $_SESSION['totp_pending_secret'] ?? '';
        $code   = trim(Request::post('code', ''));

        if (!$secret || !TOTP::verify($secret, $code)) {
            Session::flash('error', 'Msimbo si sahihi. Jaribu tena.');
            $this->redirect('/settings/security');
        }

        $userId      = Auth::id();
        $backupResult = TOTP::generateBackupCodes();

        Database::execute(
            "INSERT INTO totp_secrets (user_id, secret, backup_codes, enabled, enabled_at, created_at)
             VALUES (?,?,?,1,NOW(),NOW())
             ON DUPLICATE KEY UPDATE secret=VALUES(secret), backup_codes=VALUES(backup_codes), enabled=1, enabled_at=NOW()",
            [$userId, $secret, json_encode($backupResult['hashed'])]
        );

        unset($_SESSION['totp_pending_secret']);
        $_SESSION['totp_backup_codes'] = $backupResult['plain'];

        Audit::log('totp.enabled', 'Settings', 'user', $userId);
        Session::flash('success', 'Uthibitishaji wa hatua mbili umewashwa. Hifadhi misimbo ya dharura salama!');
        $this->redirect('/settings/security');
    }

    public function totpDisable(): void
    {
        $this->requireAuth();
        $this->verifyCsrf();

        $userId = Auth::id();
        $code   = trim(Request::post('code', ''));
        $record = Database::selectOne("SELECT secret FROM totp_secrets WHERE user_id=? AND enabled=1", [$userId]);

        if (!$record || !TOTP::verify($record['secret'], $code)) {
            Session::flash('error', 'Msimbo si sahihi.');
            $this->redirect('/settings/security');
        }

        Database::execute("UPDATE totp_secrets SET enabled=0 WHERE user_id=?", [$userId]);
        Audit::log('totp.disabled', 'Settings', 'user', $userId);
        Session::flash('success', 'Uthibitishaji wa hatua mbili umezimwa.');
        $this->redirect('/settings/security');
    }

    public function pushSubscribe(): void
    {
        $this->requireAuth();

        $raw  = file_get_contents('php://input');
        $data = json_decode($raw, true);

        if (!isset($data['endpoint'], $data['keys']['auth'], $data['keys']['p256dh'])) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid subscription']);
            exit;
        }

        $userId = Auth::id();
        $existing = Database::selectOne(
            "SELECT id FROM push_subscriptions WHERE user_id=? AND endpoint=?",
            [$userId, substr($data['endpoint'], 0, 500)]
        );

        if ($existing) {
            Database::execute(
                "UPDATE push_subscriptions SET p256dh=?, auth=? WHERE id=?",
                [$data['keys']['p256dh'], $data['keys']['auth'], $existing['id']]
            );
        } else {
            Database::insert(
                "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
                 VALUES (?,?,?,?)",
                [$userId, $data['endpoint'], $data['keys']['p256dh'], $data['keys']['auth']]
            );
        }

        echo json_encode(['success' => true]);
        exit;
    }

    public function pushUnsubscribe(): void
    {
        $this->requireAuth();

        $raw      = file_get_contents('php://input');
        $data     = json_decode($raw, true);
        $endpoint = $data['endpoint'] ?? '';

        if ($endpoint) {
            Database::execute(
                "DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?",
                [Auth::id(), $endpoint]
            );
        }

        echo json_encode(['success' => true]);
        exit;
    }
}
