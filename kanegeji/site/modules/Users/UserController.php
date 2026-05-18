<?php

namespace App\Modules\Users;

use App\Core\{Audit, Auth, Controller, Database, Request, Session};

class UserController extends Controller
{
    public function index(): void
    {
        $this->requirePermission('users.view');
        $pid  = Auth::parishId();

        $users = Database::select(
            "SELECT u.*, r.name as role_name, r.slug as role_slug
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE u.parish_id = ? AND u.deleted_at IS NULL
             ORDER BY u.name",
            [$pid]
        );

        $this->view('Users/views/index', [
            'pageTitle' => __('nav.users', 'Watumiaji'),
            'users'     => $users,
        ]);
    }

    public function create(): void
    {
        $this->requirePermission('users.create');
        $roles = Database::select("SELECT * FROM roles WHERE parish_id = ? ORDER BY id", [Auth::parishId()]);
        $this->view('Users/views/create', ['pageTitle' => 'Ongeza Mtumiaji', 'user' => [], 'roles' => $roles]);
    }

    public function store(): void
    {
        $this->requirePermission('users.create');
        $this->verifyCsrf();

        $data   = Request::only(['name', 'email', 'phone', 'role_id', 'lang']);
        $errors = $this->validate($data, ['name' => 'required', 'email' => 'required|email', 'role_id' => 'required']);

        if ($errors) {
            Session::flash('error', 'Tafadhali sahihisha makosa.');
            $this->redirect('/users/create');
        }

        $existing = Database::selectOne("SELECT id FROM users WHERE email = ?", [$data['email']]);
        if ($existing) {
            Session::flash('error', 'Barua pepe hiyo tayari ipo.');
            $this->redirect('/users/create');
        }

        $tempPassword = bin2hex(random_bytes(6));

        Database::execute(
            "INSERT INTO users (parish_id, name, email, phone, password_hash, role_id, lang, must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
            [Auth::parishId(), $data['name'], strtolower($data['email']), $data['phone'] ?: null,
             password_hash($tempPassword, PASSWORD_BCRYPT, ['cost' => 12]),
             $data['role_id'], $data['lang'] ?? 'sw']
        );

        $id = Database::lastId();
        Audit::log('user.create', 'Users', 'user', (int) $id, [], $data);

        Session::flash('success', "Mtumiaji ametengenezwa. Nywila ya muda: {$tempPassword}");
        $this->redirect('/users');
    }

    public function edit(string $id): void
    {
        $this->requirePermission('users.edit');
        $pid  = Auth::parishId();
        $user = Database::selectOne("SELECT * FROM users WHERE id = ? AND parish_id = ? AND deleted_at IS NULL", [$id, $pid]);
        if (!$user) { $this->redirect('/users'); }

        $roles = Database::select("SELECT * FROM roles WHERE parish_id = ? ORDER BY id", [$pid]);
        $this->view('Users/views/create', ['pageTitle' => 'Hariri Mtumiaji', 'user' => $user, 'roles' => $roles, 'editing' => true]);
    }

    public function update(string $id): void
    {
        $this->requirePermission('users.edit');
        $this->verifyCsrf();

        $pid  = Auth::parishId();
        $data = Request::only(['name', 'phone', 'role_id', 'lang', 'active']);
        $data['active'] = isset($data['active']) ? 1 : 0;

        Database::execute(
            "UPDATE users SET name=?, phone=?, role_id=?, lang=?, active=? WHERE id=? AND parish_id=?",
            [$data['name'], $data['phone'] ?: null, $data['role_id'], $data['lang'] ?? 'sw', $data['active'], $id, $pid]
        );

        Audit::log('user.update', 'Users', 'user', (int) $id);
        Session::flash('success', 'Mtumiaji amesasishwa.');
        $this->redirect('/users');
    }

    public function destroy(string $id): void
    {
        $this->requirePermission('users.delete');
        $this->verifyCsrf();

        if ((int) $id === Auth::id()) {
            Session::flash('error', 'Huwezi kufuta akaunti yako mwenyewe.');
            $this->redirect('/users');
        }

        Database::execute(
            "UPDATE users SET deleted_at = NOW(), active = 0 WHERE id = ? AND parish_id = ?",
            [$id, Auth::parishId()]
        );

        Audit::log('user.delete', 'Users', 'user', (int) $id);
        Session::flash('success', 'Mtumiaji amefutwa.');
        $this->redirect('/users');
    }
}
