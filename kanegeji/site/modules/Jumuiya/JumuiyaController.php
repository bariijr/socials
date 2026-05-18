<?php

namespace App\Modules\Jumuiya;

use App\Core\{Audit, Auth, Controller, Database, Request, Session};

class JumuiyaController extends Controller
{
    public function index(): void
    {
        $this->requirePermission('jumuiya.view');
        $pid = Auth::parishId();

        $communities = Database::select(
            "SELECT c.*,
                    COUNT(m.id) as member_count,
                    COALESCE(SUM(CASE WHEN t.status='approved' AND YEAR(t.transaction_date) = YEAR(CURDATE()) THEN t.amount END), 0) as contributions_this_year
             FROM communities c
             LEFT JOIN members m ON m.community_id = c.id AND m.status = 'active' AND m.deleted_at IS NULL
             LEFT JOIN transactions t ON t.community_id = c.id AND t.deleted_at IS NULL
             WHERE c.parish_id = ?
             GROUP BY c.id
             ORDER BY contributions_this_year DESC",
            [$pid]
        );

        $this->view('Jumuiya/views/index', [
            'pageTitle'   => __('jumuiya.title', 'Jumuiya'),
            'communities' => $communities,
        ]);
    }

    public function create(): void
    {
        $this->requirePermission('jumuiya.manage');
        $this->view('Jumuiya/views/create', ['pageTitle' => __('jumuiya.add_jumuiya', 'Ongeza Jumuiya'), 'community' => []]);
    }

    public function store(): void
    {
        $this->requirePermission('jumuiya.manage');
        $this->verifyCsrf();

        $data = Request::only(['name', 'zone', 'leader_name', 'leader_phone']);
        $errors = $this->validate($data, ['name' => 'required|max:150']);

        if ($errors) {
            Session::flash('error', 'Jina la jumuiya linahitajika.');
            $this->redirect('/jumuiya/create');
        }

        $data['parish_id'] = Auth::parishId();
        $data['active']    = 1;

        Database::execute(
            "INSERT INTO communities (parish_id, name, zone, leader_name, leader_phone) VALUES (?, ?, ?, ?, ?)",
            [$data['parish_id'], $data['name'], $data['zone'] ?: null, $data['leader_name'] ?: null, $data['leader_phone'] ?: null]
        );

        Audit::log('jumuiya.create', 'Jumuiya', 'community', (int) Database::lastId(), [], $data);
        Session::flash('success', 'Jumuiya imeongezwa.');
        $this->redirect('/jumuiya');
    }

    public function show(string $id): void
    {
        $this->requirePermission('jumuiya.view');
        $pid = Auth::parishId();

        $community = Database::selectOne(
            "SELECT c.*, COUNT(m.id) as member_count FROM communities c
             LEFT JOIN members m ON m.community_id = c.id AND m.status = 'active' AND m.deleted_at IS NULL
             WHERE c.id = ? AND c.parish_id = ?",
            [$id, $pid]
        );

        if (!$community) { $this->redirect('/jumuiya'); }

        $members = Database::select(
            "SELECT * FROM members WHERE community_id = ? AND parish_id = ? AND deleted_at IS NULL ORDER BY last_name, first_name",
            [$id, $pid]
        );

        $contributions = Database::select(
            "SELECT DATE_FORMAT(transaction_date, '%Y-%m') as month, SUM(amount) as total
             FROM transactions WHERE community_id = ? AND parish_id = ? AND status = 'approved' AND deleted_at IS NULL
             AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
             GROUP BY month ORDER BY month DESC",
            [$id, $pid]
        );

        $this->view('Jumuiya/views/show', [
            'pageTitle'     => $community['name'],
            'community'     => $community,
            'members'       => $members,
            'contributions' => $contributions,
        ]);
    }

    public function edit(string $id): void
    {
        $this->requirePermission('jumuiya.manage');
        $community = Database::selectOne("SELECT * FROM communities WHERE id = ? AND parish_id = ?", [$id, Auth::parishId()]);
        if (!$community) { $this->redirect('/jumuiya'); }

        $this->view('Jumuiya/views/create', ['pageTitle' => 'Hariri: ' . $community['name'], 'community' => $community, 'editing' => true]);
    }

    public function update(string $id): void
    {
        $this->requirePermission('jumuiya.manage');
        $this->verifyCsrf();

        $data = Request::only(['name', 'zone', 'leader_name', 'leader_phone', 'active']);
        $data['active'] = isset($data['active']) ? 1 : 0;

        Database::execute(
            "UPDATE communities SET name=?, zone=?, leader_name=?, leader_phone=?, active=? WHERE id=? AND parish_id=?",
            [$data['name'], $data['zone'] ?: null, $data['leader_name'] ?: null, $data['leader_phone'] ?: null, $data['active'], $id, Auth::parishId()]
        );

        Audit::log('jumuiya.update', 'Jumuiya', 'community', (int) $id);
        Session::flash('success', 'Jumuiya imesasishwa.');
        $this->redirect("/jumuiya/{$id}");
    }

    public function destroy(string $id): void
    {
        $this->requirePermission('jumuiya.manage');
        $this->verifyCsrf();

        Database::execute("UPDATE communities SET active=0 WHERE id=? AND parish_id=?", [$id, Auth::parishId()]);
        Session::flash('success', 'Jumuiya imefungwa.');
        $this->redirect('/jumuiya');
    }
}
