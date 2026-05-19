<?php

namespace App\Modules\Auth;

use App\Core\{Auth, Audit, Controller, CSRF, Request, Session};

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

        $result = $this->service->attemptLogin($email, $password, $ip);

        if (!$result['success']) {
            $msg = match ($result['reason']) {
                'locked'   => __('auth.account_locked', 'Akaunti imefungwa.'),
                'inactive' => 'Akaunti haifanyi kazi. Wasiliana na msimamizi.',
                default    => __('auth.login_failed', 'Barua pepe au nywila si sahihi.'),
            };
            Audit::logLogin($email, $result['reason'] === 'locked' ? 'locked' : 'failed', $result['reason']);
            Session::flash('error', $msg);
            $this->redirect('/login');
        }

        Auth::login($result['user']);
        Audit::logLogin($email, 'success');
        Audit::log('login', 'Auth', 'user', $result['user']['id']);

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
            $token = bin2hex(random_bytes(32));
            $this->service->setResetToken($user['id'], $token);
            // TODO: send email with reset link
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
