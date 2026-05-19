<?php

namespace App\Modules\Committees;

use App\Core\{Audit, Auth, Controller, Database, Request, Session};

class CommitteeController extends Controller
{
    public function index(): void
    {
        $this->requirePermission('committees_view');
        $pid = Auth::parishId();

        $committees = Database::select(
            "SELECT c.*,
                    COUNT(DISTINCT cm.id) as member_count,
                    m.first_name, m.last_name
             FROM committees c
             LEFT JOIN committee_members cm ON cm.committee_id = c.id
             LEFT JOIN members m ON m.id = c.chairperson_id
             WHERE c.parish_id = ? AND c.deleted_at IS NULL
             GROUP BY c.id ORDER BY c.name ASC",
            [$pid]
        );

        $this->view('Committees/views/index', compact('committees'));
    }

    public function show(int $id): void
    {
        $this->requirePermission('committees_view');
        $pid = Auth::parishId();

        $committee = Database::selectOne(
            "SELECT c.*, m.first_name as chair_first, m.last_name as chair_last
             FROM committees c LEFT JOIN members m ON m.id=c.chairperson_id
             WHERE c.id=? AND c.parish_id=? AND c.deleted_at IS NULL",
            [$id, $pid]
        );
        if (!$committee) {
            Session::flash('error', 'Kamati haikupatikana.');
            $this->redirect('/committees');
        }

        $members = Database::select(
            "SELECT cm.id as cm_id, cm.role, cm.joined_at,
                    m.id, m.first_name, m.last_name, m.phone
             FROM committee_members cm
             JOIN members m ON m.id = cm.member_id
             WHERE cm.committee_id = ? ORDER BY m.first_name, m.last_name",
            [$id]
        );

        // For add-member dropdown — exclude existing members
        $existingIds = array_column($members, 'id') ?: [0];
        $placeholders = implode(',', array_fill(0, count($existingIds), '?'));
        $available = Database::select(
            "SELECT id, first_name, last_name FROM members
             WHERE parish_id=? AND status='active' AND deleted_at IS NULL AND id NOT IN ({$placeholders})
             ORDER BY first_name, last_name",
            array_merge([$pid], $existingIds)
        );

        $this->view('Committees/views/show', compact('committee', 'members', 'available'));
    }

    public function create(): void
    {
        $this->requirePermission('committees_manage');
        $chairpersons = Database::select(
            "SELECT id, first_name, last_name FROM members
             WHERE parish_id=? AND status='active' AND deleted_at IS NULL ORDER BY first_name",
            [Auth::parishId()]
        );
        $this->view('Committees/views/create', compact('chairpersons'));
    }

    public function store(): void
    {
        $this->requirePermission('committees_manage');
        $this->verifyCsrf();

        $name = trim(Request::post('name', ''));
        if (!$name) {
            Session::flash('error', 'Jina la kamati linahitajika.');
            $this->redirect('/committees/create');
        }

        $id = Database::insert(
            "INSERT INTO committees (parish_id, name, description, type, chairperson_id, active, created_at)
             VALUES (?,?,?,?,?,1,NOW())",
            [
                Auth::parishId(),
                $name,
                trim(Request::post('description', '')) ?: null,
                Request::post('type', 'other'),
                (int) Request::post('chairperson_id', 0) ?: null,
            ]
        );

        Audit::log('create', 'Committees', 'committees', $id);
        Session::flash('success', 'Kamati imeundwa.');
        $this->redirect('/committees/' . $id);
    }

    public function addMember(int $id): void
    {
        $this->requirePermission('committees_manage');
        $this->verifyCsrf();

        $memberId = (int) Request::post('member_id', 0);
        if (!$memberId) {
            Session::flash('error', 'Chagua mwanachama.');
            $this->redirect('/committees/' . $id);
        }

        Database::execute(
            "INSERT IGNORE INTO committee_members (committee_id, member_id, role, joined_at, created_at)
             VALUES (?, ?, ?, ?, NOW())",
            [
                $id,
                $memberId,
                trim(Request::post('role', '')) ?: null,
                Request::post('joined_at', '') ?: null,
            ]
        );

        Audit::log('add_member', 'Committees', 'committees', $id, [], ['member_id' => $memberId]);
        Session::flash('success', 'Mwanachama ameongezwa kwenye kamati.');
        $this->redirect('/committees/' . $id);
    }

    public function removeMember(int $cmId): void
    {
        $this->requirePermission('committees_manage');
        $this->verifyCsrf();

        $row = Database::selectOne("SELECT * FROM committee_members WHERE id=?", [$cmId]);
        if ($row) {
            Database::execute("DELETE FROM committee_members WHERE id=?", [$cmId]);
            Audit::log('remove_member', 'Committees', 'committee_members', $cmId);
        }

        $committeeId = $row['committee_id'] ?? 0;
        Session::flash('success', 'Mwanachama ameondolewa.');
        $this->redirect('/committees/' . $committeeId);
    }

    public function toggle(int $id): void
    {
        $this->requirePermission('committees_manage');
        $this->verifyCsrf();

        $c = Database::selectOne("SELECT active FROM committees WHERE id=? AND parish_id=?", [$id, Auth::parishId()]);
        if ($c) {
            Database::execute("UPDATE committees SET active=? WHERE id=?", [$c['active'] ? 0 : 1, $id]);
        }
        $this->redirect('/committees');
    }

    public function destroy(int $id): void
    {
        $this->requirePermission('committees_manage');
        $this->verifyCsrf();

        Database::execute(
            "UPDATE committees SET deleted_at=NOW() WHERE id=? AND parish_id=?",
            [$id, Auth::parishId()]
        );
        Audit::log('delete', 'Committees', 'committees', $id);
        Session::flash('success', 'Kamati imefutwa.');
        $this->redirect('/committees');
    }
}
