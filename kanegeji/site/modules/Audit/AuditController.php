<?php

namespace App\Modules\Audit;

use App\Core\{Auth, Controller, Database, Request};

class AuditController extends Controller
{
    public function index(): void
    {
        $this->requirePermission('audit.view');
        $pid  = Auth::parishId();
        $page = max(1, Request::int('page', 1));
        $per  = 30;
        $off  = ($page - 1) * $per;

        $module = Request::sanitize('module');
        $userId = Request::int('user_id');

        $where  = ['parish_id = ?'];
        $params = [$pid];
        if ($module) { $where[] = 'module = ?'; $params[] = $module; }
        if ($userId) { $where[] = 'user_id = ?'; $params[] = $userId; }
        $sql = implode(' AND ', $where);

        $total = (int) (Database::selectOne("SELECT COUNT(*) as cnt FROM audit_logs WHERE {$sql}", $params)['cnt'] ?? 0);
        $logs  = Database::select("SELECT * FROM audit_logs WHERE {$sql} ORDER BY created_at DESC LIMIT {$per} OFFSET {$off}", $params);

        $modules = Database::select("SELECT DISTINCT module FROM audit_logs WHERE parish_id = ? ORDER BY module", [$pid]);

        $this->view('Audit/views/index', [
            'pageTitle' => __('nav.audit', 'Ukaguzi'),
            'logs'      => $logs,
            'total'     => $total,
            'page'      => $page,
            'perPage'   => $per,
            'lastPage'  => (int) ceil($total / $per),
            'modules'   => $modules,
            'filter_module' => $module,
            'filter_user'   => $userId,
        ]);
    }

    public function logins(): void
    {
        $this->requirePermission('audit.view');
        $pid  = Auth::parishId();
        $page = max(1, Request::int('page', 1));
        $per  = 30;
        $off  = ($page - 1) * $per;

        $total = (int) (Database::selectOne("SELECT COUNT(*) as cnt FROM login_logs WHERE parish_id = ?", [$pid])['cnt'] ?? 0);
        $logs  = Database::select("SELECT * FROM login_logs WHERE parish_id = ? ORDER BY created_at DESC LIMIT {$per} OFFSET {$off}", [$pid]);

        $this->view('Audit/views/logins', [
            'pageTitle' => 'Historia ya Kuingia',
            'logs'      => $logs,
            'total'     => $total,
            'page'      => $page,
            'perPage'   => $per,
            'lastPage'  => (int) ceil($total / $per),
        ]);
    }
}
