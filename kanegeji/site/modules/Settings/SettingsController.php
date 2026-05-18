<?php

namespace App\Modules\Settings;

use App\Core\{Audit, Auth, Controller, Database, Request, Session};

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
}
