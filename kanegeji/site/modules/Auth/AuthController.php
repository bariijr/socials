<?php

namespace App\Modules\Auth;

use App\Core\{Auth, Audit, Controller, Database, CSRF, Request, RateLimit, Session, TOTP};
use App\Core\Channels\Email;

class AuthController extends Controller
{
    private AuthService $service;

    public function __construct()
    {
        $this->service = new AuthService();
    }

    public function showLogin(): void
    {
        if (Auth::check()) {
            $this->redirect('/dashboard');
        }
        $this->view('Auth/views/login', ['pageTitle' => __('auth.login', 'Ingia')], 'auth');
    }

    public function login(): void
    {
        $this->verifyCsrf();

        $email    = strtolower(trim(Request::post('email', '')));
        $password = Request::post('password', '');
        $ip       = Request::ip();

        if (!$email || !$password) {
            Session::flash('error', __('auth.login_failed', 'Tafadhali jaza sehemu zote.'));
            $this->redirect('/login');
        }

        // Rate limiting: max 5 attempts per 15 minutes per IP
        $rlKey = 'login_' . $ip;
        if (!RateLimit::check($rlKey, (int) env('RATE_LIMIT_LOGIN', 5), (int) env('RATE_LIMIT_WINDOW', 900))) {
            Session::flash('error', 'Umejaribu mara nyingi sana. Subiri dakika 15 kisha ujaribu tena.');
            $this->redirect('/login');
        }

        $result = $this->service->attemptLogin($email, $password, $ip);

        if (!$result['success']) {
            $msg = match ($result['reason']) {
                'locked'   => __('auth.account_locked', 'Akaunti imefungwa.'),
                'inactive' => 'Akaunti haifanyi kazi. Wasiliana na msimamizi.',
                default    => __('auth.login_failed', 'Barua pepe au nywila si sahihi.'),
            };
            Session::flash('error', $msg);
            try { Audit::logLogin($email, $result['reason'] === 'locked' ? 'locked' : 'failed', $result['reason']); } catch (\Throwable) {}
            $this->redirect('/login');
        }

        RateLimit::clear($rlKey);

        // Check if user has TOTP 2FA enabled
        $totp2fa = false;
        try {
            $totp2fa = Database::selectOne(
                "SELECT 1 FROM totp_secrets WHERE user_id=? AND enabled=1 LIMIT 1",
                [$result['user']['id']]
            );
        } catch (\Throwable) {}
        if ($totp2fa) {
            $_SESSION['pending_2fa_user_id'] = $result['user']['id'];
            try { Audit::log('login.2fa_required', 'Auth', 'user', $result['user']['id']); } catch (\Throwable) {}
            $this->redirect('/login/totp');
        }

        Auth::login($result['user']);
        try { Audit::logLogin($email, 'success'); } catch (\Throwable) {}
        try { Audit::log('login', 'Auth', 'user', $result['user']['id']); } catch (\Throwable) {}

        Session::flash('success', __('auth.login_success', 'Umeingia mafanikio.'));
        $this->redirect('/dashboard');
    }

    public function logout(): void
    {
        $userId = Auth::id();
        Audit::log('logout', 'Auth', 'user', $userId ?? 0);
        Auth::logout();
        Session::flash('success', __('auth.logout_success', 'Umetoka mafanikio.'));
        $this->redirect('/login');
    }

    public function showForgot(): void
    {
        $this->view('Auth/views/forgot_password', ['pageTitle' => 'Forgot Password'], 'auth');
    }

    public function sendReset(): void
    {
        $this->verifyCsrf();
        $email = strtolower(trim(Request::post('email', '')));
        $user  = $this->service->getUserByEmail($email);

        if ($user) {
            $token   = bin2hex(random_bytes(32));
            $this->service->setResetToken($user['id'], $token);
            $appUrl  = rtrim(env('APP_URL', ''), '/');
            $link    = "{$appUrl}/reset-password?token={$token}";
            $appName = env('APP_NAME', 'Parish ERP');
            $html    = "<p>Ndugu <strong>" . htmlspecialchars($user['name']) . "</strong>,</p>
                        <p>Tumepokea ombi la kubadilisha nywila yako.</p>
                        <p>Bonyeza kiungo hapa chini kubadilisha nywila yako (kinaisha baada ya masaa 2):</p>
                        <p><a href='{$link}' style='color:#7c3aed'>{$link}</a></p>
                        <p>Kama hukutuma ombi hili, puuza ujumbe huu.</p>
                        <p>— {$appName}</p>";
            Email::send($user['email'], $user['name'], 'Badilisha Nywila — ' . $appName, $html);
        }

        // Always show same message to prevent email enumeration
        Session::flash('success', 'Kama barua pepe hiyo ipo, utapokea maelekezo ya kubadilisha nywila.');
        $this->redirect('/forgot-password');
    }

    public function showReset(): void
    {
        $token = Request::get('token', '');
        $user  = $this->service->getUserByResetToken($token);
        if (!$user) {
            Session::flash('error', 'Kiungo cha kubadilisha nywila hakipo au kimeisha muda.');
            $this->redirect('/login');
        }
        $this->view('Auth/views/reset_password', ['pageTitle' => 'Reset Password', 'token' => $token], 'auth');
    }

    public function resetPassword(): void
    {
        $this->verifyCsrf();
        $token    = Request::post('token', '');
        $password = Request::post('password', '');
        $confirm  = Request::post('password_confirmation', '');

        $user = $this->service->getUserByResetToken($token);
        if (!$user) {
            Session::flash('error', 'Kiungo cha kubadilisha nywila hakipo au kimeisha muda.');
            $this->redirect('/login');
        }

        if (strlen($password) < 8 || $password !== $confirm) {
            Session::flash('error', 'Nywila lazima iwe na herufi 8+ na zilingane.');
            $this->redirect("/reset-password?token={$token}");
        }

        $this->service->resetPassword($user['id'], $password);
        Session::flash('success', 'Nywila imebadilishwa. Tafadhali ingia.');
        $this->redirect('/login');
    }

    public function showRegister(): void
    {
        $parishes = \App\Core\Database::select(
            "SELECT id, name FROM parishes WHERE active=1 ORDER BY name"
        );
        $this->view('Auth/views/register', compact('parishes'), 'auth');
    }

    public function storeApplication(): void
    {
        $this->verifyCsrf();

        $parishId = (int) ($_POST['parish_id'] ?? 0);
        if (!$parishId) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Chagua parokia.'];
            redirect('/register');
        }

        \App\Core\Database::insert(
            "INSERT INTO member_applications
                (parish_id, first_name, last_name, phone, email, date_of_birth, gender, community_name, status, created_at)
             VALUES (?,?,?,?,?,?,?,?,'pending',NOW())",
            [
                $parishId,
                trim($_POST['first_name'] ?? ''),
                trim($_POST['last_name'] ?? ''),
                trim($_POST['phone'] ?? '') ?: null,
                trim($_POST['email'] ?? '') ?: null,
                $_POST['date_of_birth'] ?: null,
                $_POST['gender'] ?: null,
                trim($_POST['community_name'] ?? '') ?: null,
            ]
        );

        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Ombi lako limetumwa. Utaarifiwa baada ya kukaguliwa.'];
        redirect('/login');
    }

    // ── TOTP 2FA step ────────────────────────────────────────────

    public function showTotp(): void
    {
        if (Auth::check()) {
            $this->redirect('/dashboard');
        }
        if (empty($_SESSION['pending_2fa_user_id'])) {
            $this->redirect('/login');
        }
        $this->view('Auth/views/totp', ['pageTitle' => 'Thibitisha Utambulisho'], 'auth');
    }

    public function verifyTotp(): void
    {
        $this->verifyCsrf();

        $pendingId = $_SESSION['pending_2fa_user_id'] ?? null;
        if (!$pendingId) {
            $this->redirect('/login');
        }

        $code      = trim(Request::post('code', ''));
        $useBackup = (bool) Request::post('use_backup', 0);

        $record = Database::selectOne(
            "SELECT * FROM totp_secrets WHERE user_id=? AND enabled=1",
            [$pendingId]
        );

        if (!$record) {
            unset($_SESSION['pending_2fa_user_id']);
            $this->redirect('/login');
        }

        $valid = false;
        if ($useBackup) {
            $hashes = json_decode($record['backup_codes'], true) ?? [];
            $valid  = TOTP::verifyBackupCode($code, $hashes);
            if ($valid) {
                Database::execute(
                    "UPDATE totp_secrets SET backup_codes=? WHERE user_id=?",
                    [json_encode($hashes), $pendingId]
                );
            }
        } else {
            $valid = TOTP::verify($record['secret'], $code);
        }

        if (!$valid) {
            Session::flash('error', 'Msimbo si sahihi. Jaribu tena.');
            $this->redirect('/login/totp');
        }

        $user = Database::selectOne(
            "SELECT u.*, r.slug as role_slug FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?",
            [$pendingId]
        );

        unset($_SESSION['pending_2fa_user_id']);
        Auth::login($user);
        Audit::logLogin($user['email'], 'success');
        Audit::log('login.totp', 'Auth', 'user', $user['id']);

        Session::flash('success', __('auth.login_success', 'Umeingia mafanikio.'));
        $this->redirect('/dashboard');
    }

    public function verify(string $code): void
    {
        // QR verification handler for receipts, certificates, tickets
        $code = preg_replace('/[^A-Z0-9]/', '', strtoupper($code));

        // Try receipts first
        $receipt = \App\Core\Database::selectOne(
            "SELECT r.*, t.amount, t.description, t.transaction_date, t.type
             FROM receipts r JOIN transactions t ON t.id = r.transaction_id
             WHERE r.qr_code = ? LIMIT 1",
            [$code]
        );

        if ($receipt) {
            $this->view('Auth/views/verify', ['code' => $code, 'type' => 'receipt', 'data' => $receipt], 'auth');
            return;
        }

        $this->view('Auth/views/verify', ['code' => $code, 'type' => 'notfound', 'data' => []], 'auth');
    }
}
