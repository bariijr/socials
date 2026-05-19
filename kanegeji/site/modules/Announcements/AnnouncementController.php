<?php

namespace App\Modules\Announcements;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;

class AnnouncementController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
        $this->requirePermission('announcements_view');
    }

    public function index(): void
    {
        $pid     = Auth::parishId();
        $page    = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = 20;
        $offset  = ($page - 1) * $perPage;
        $type    = $_GET['type'] ?? '';

        $where  = ['parish_id = ?'];
        $params = [$pid];
        if ($type) { $where[] = 'type = ?'; $params[] = $type; }

        $whereStr = implode(' AND ', $where);
        $total    = Database::selectOne("SELECT COUNT(*) as cnt FROM announcements WHERE {$whereStr}", $params)['cnt'];
        $rows     = Database::select(
            "SELECT a.*, u.name as author FROM announcements a
             LEFT JOIN users u ON u.id = a.published_by
             WHERE {$whereStr} ORDER BY a.created_at DESC LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        $this->view('Announcements/views/index', compact('rows', 'total', 'page', 'perPage', 'type'));
    }

    public function create(): void
    {
        $this->requirePermission('announcements_manage');
        $this->view('Announcements/views/create');
    }

    public function store(): void
    {
        $this->requirePermission('announcements_manage');
        $this->verifyCsrf();

        $id = Database::insert(
            "INSERT INTO announcements (parish_id, title, content, type, published_at, expires_at, active, published_by, created_at)
             VALUES (?,?,?,?,?,?,1,?,NOW())",
            [
                Auth::parishId(),
                trim($_POST['title']),
                trim($_POST['content']),
                $_POST['type'] ?? 'general',
                $_POST['published_at'] ? date('Y-m-d H:i:s', strtotime($_POST['published_at'])) : date('Y-m-d H:i:s'),
                !empty($_POST['expires_at']) ? date('Y-m-d H:i:s', strtotime($_POST['expires_at'])) : null,
                Auth::id(),
            ]
        );

        Audit::log('create', 'Announcements', 'announcement', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Tangazo limehifadhiwa.'];
        redirect('/announcements');
    }

    public function toggle(int $id): void
    {
        $this->requirePermission('announcements_manage');
        $this->verifyCsrf();
        $a = Database::selectOne("SELECT active FROM announcements WHERE id=? AND parish_id=?", [$id, Auth::parishId()]);
        if (!$a) redirect('/announcements');
        Database::execute("UPDATE announcements SET active=? WHERE id=?", [$a['active'] ? 0 : 1, $id]);
        redirect('/announcements');
    }

    public function destroy(int $id): void
    {
        $this->requirePermission('announcements_manage');
        $this->verifyCsrf();
        Database::execute("DELETE FROM announcements WHERE id=? AND parish_id=?", [$id, Auth::parishId()]);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Tangazo limefutwa.'];
        redirect('/announcements');
    }
}
