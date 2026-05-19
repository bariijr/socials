<?php

namespace App\Modules\Admin;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;

class AdminController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
        if (Auth::role() !== 'super_admin') {
            redirect('/dashboard');
        }
    }

    public function index(): void
    {
        $stats = Database::selectOne(
            "SELECT
               (SELECT COUNT(*) FROM parishes WHERE deleted_at IS NULL) as total_parishes,
               (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as total_users,
               (SELECT COUNT(*) FROM members WHERE deleted_at IS NULL) as total_members,
               (SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL) as total_transactions"
        );

        $recentParishes = Database::select(
            "SELECT p.*, COUNT(m.id) as member_count
             FROM parishes p LEFT JOIN members m ON m.parish_id=p.id AND m.deleted_at IS NULL
             WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY p.created_at DESC LIMIT 10"
        );

        $this->view('Admin/views/index', compact('stats', 'recentParishes'));
    }

    public function parishes(): void
    {
        $page    = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = 25;
        $offset  = ($page - 1) * $perPage;
        $search  = trim($_GET['q'] ?? '');

        $where  = ['p.deleted_at IS NULL'];
        $params = [];
        if ($search) {
            $where[]  = '(p.name LIKE ? OR p.diocese LIKE ?)';
            $params[] = "%{$search}%";
            $params[] = "%{$search}%";
        }
        $whereStr = implode(' AND ', $where);

        $total = Database::selectOne("SELECT COUNT(*) as cnt FROM parishes p WHERE {$whereStr}", $params)['cnt'];
        $rows  = Database::select(
            "SELECT p.*, COUNT(m.id) as member_count, COUNT(DISTINCT u.id) as user_count
             FROM parishes p
             LEFT JOIN members m ON m.parish_id=p.id AND m.deleted_at IS NULL
             LEFT JOIN users u ON u.parish_id=p.id AND u.deleted_at IS NULL
             WHERE {$whereStr} GROUP BY p.id ORDER BY p.name ASC LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        $this->view('Admin/views/parishes', compact('rows', 'total', 'page', 'perPage', 'search'));
    }

    public function createParish(): void
    {
        $this->view('Admin/views/create_parish');
    }

    public function storeParish(): void
    {
        $this->verifyCsrf();

        $id = Database::insert(
            "INSERT INTO parishes (name, diocese, address, phone, email, subscription_plan, active, created_at)
             VALUES (?,?,?,?,?,'basic',1,NOW())",
            [
                trim($_POST['name']),
                trim($_POST['diocese'] ?? ''),
                trim($_POST['address'] ?? ''),
                trim($_POST['phone'] ?? ''),
                trim($_POST['email'] ?? ''),
            ]
        );

        Audit::log('create', 'Admin', 'parishes', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Parokia imeundwa.'];
        redirect('/admin/parishes');
    }

    public function showParish(int $id): void
    {
        $parish = Database::selectOne("SELECT * FROM parishes WHERE id=?", [$id]);
        if (!$parish) redirect('/admin/parishes');

        $users = Database::select(
            "SELECT * FROM users WHERE parish_id=? AND deleted_at IS NULL ORDER BY name", [$id]
        );
        $stats = Database::selectOne(
            "SELECT
               (SELECT COUNT(*) FROM members WHERE parish_id=? AND deleted_at IS NULL) as members,
               (SELECT COUNT(*) FROM transactions WHERE parish_id=? AND deleted_at IS NULL) as transactions,
               (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE parish_id=? AND type='income' AND status='approved' AND deleted_at IS NULL) as total_income",
            [$id, $id, $id]
        );

        $this->view('Admin/views/show_parish', compact('parish', 'users', 'stats'));
    }

    public function toggleParish(int $id): void
    {
        $this->verifyCsrf();
        $parish = Database::selectOne("SELECT active FROM parishes WHERE id=?", [$id]);
        if (!$parish) redirect('/admin/parishes');

        $newActive = $parish['active'] ? 0 : 1;
        Database::execute("UPDATE parishes SET active=? WHERE id=?", [$newActive, $id]);
        Audit::log('toggle', 'Admin', 'parishes', $id, [], ['active' => $newActive]);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Hali ya parokia imebadilishwa.'];
        redirect('/admin/parishes/' . $id);
    }

    public function applications(): void
    {
        $page    = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = 25;
        $offset  = ($page - 1) * $perPage;
        $status  = $_GET['status'] ?? 'pending';

        $total = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM member_applications WHERE status=?", [$status]
        )['cnt'];

        $rows = Database::select(
            "SELECT ma.*, p.name as parish_name FROM member_applications ma
             LEFT JOIN parishes p ON p.id=ma.parish_id
             WHERE ma.status=? ORDER BY ma.created_at DESC LIMIT {$perPage} OFFSET {$offset}",
            [$status]
        );

        $this->view('Admin/views/applications', compact('rows', 'total', 'page', 'perPage', 'status'));
    }

    public function approveApplication(int $id): void
    {
        $this->verifyCsrf();
        Database::execute(
            "UPDATE member_applications SET status='approved', reviewed_by=?, reviewed_at=NOW() WHERE id=?",
            [Auth::id(), $id]
        );
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Ombi limeidhinishwa.'];
        redirect('/admin/applications');
    }

    public function rejectApplication(int $id): void
    {
        $this->verifyCsrf();
        Database::execute(
            "UPDATE member_applications SET status='rejected', reviewed_by=?, reviewed_at=NOW(), notes=? WHERE id=?",
            [Auth::id(), trim($_POST['reason'] ?? ''), $id]
        );
        $_SESSION['flash'] = ['type' => 'info', 'message' => 'Ombi limekataliwa.'];
        redirect('/admin/applications');
    }
}
