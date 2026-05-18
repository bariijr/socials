<?php

namespace App\Modules\Reports;

use App\Core\{Audit, Auth, Controller, Database, Request, Session};

class ReportController extends Controller
{
    public function index(): void
    {
        $this->requirePermission('reports.view');
        $this->view('Reports/views/index', ['pageTitle' => __('reports.title', 'Ripoti')]);
    }

    public function income(): void
    {
        $this->requirePermission('reports.view');
        $this->renderFinancialReport('income');
    }

    public function expenses(): void
    {
        $this->requirePermission('reports.view');
        $this->renderFinancialReport('expense');
    }

    private function renderFinancialReport(string $type): void
    {
        $pid      = Auth::parishId();
        $dateFrom = Request::date('date_from', date('Y-m-01'));
        $dateTo   = Request::date('date_to', date('Y-m-t'));

        $summary = Database::selectOne(
            "SELECT SUM(amount) as total, COUNT(*) as count
             FROM transactions
             WHERE parish_id = ? AND type = ? AND status = 'approved' AND deleted_at IS NULL
             AND transaction_date BETWEEN ? AND ?",
            [$pid, $type, $dateFrom, $dateTo]
        );

        $byCategory = Database::select(
            "SELECT tc.name as category, SUM(t.amount) as total, COUNT(*) as count
             FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             WHERE t.parish_id = ? AND t.type = ? AND t.status = 'approved' AND t.deleted_at IS NULL
             AND t.transaction_date BETWEEN ? AND ?
             GROUP BY t.category_id, tc.name
             ORDER BY total DESC",
            [$pid, $type, $dateFrom, $dateTo]
        );

        $byMonth = Database::select(
            "SELECT DATE_FORMAT(transaction_date, '%Y-%m') as month, SUM(amount) as total
             FROM transactions
             WHERE parish_id = ? AND type = ? AND status = 'approved' AND deleted_at IS NULL
             AND transaction_date BETWEEN ? AND ?
             GROUP BY month ORDER BY month",
            [$pid, $type, $dateFrom, $dateTo]
        );

        $transactions = Database::select(
            "SELECT t.*, tc.name as category_name, pm.name as payment_method_name
             FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
             WHERE t.parish_id = ? AND t.type = ? AND t.status = 'approved' AND t.deleted_at IS NULL
             AND t.transaction_date BETWEEN ? AND ?
             ORDER BY t.transaction_date DESC",
            [$pid, $type, $dateFrom, $dateTo]
        );

        $pageTitle = $type === 'income' ? 'Ripoti ya Mapato' : 'Ripoti ya Matumizi';
        Audit::log('report.view', 'Reports', '', 0, [], ['type' => $type, 'from' => $dateFrom, 'to' => $dateTo]);

        $this->view('Reports/views/financial', [
            'pageTitle'    => $pageTitle,
            'type'         => $type,
            'dateFrom'     => $dateFrom,
            'dateTo'       => $dateTo,
            'summary'      => $summary,
            'byCategory'   => $byCategory,
            'byMonth'      => $byMonth,
            'transactions' => $transactions,
        ]);
    }

    public function members(): void
    {
        $this->requirePermission('reports.view');
        $pid = Auth::parishId();

        $byGender = Database::select(
            "SELECT gender, COUNT(*) as count FROM members WHERE parish_id = ? AND status = 'active' AND deleted_at IS NULL GROUP BY gender",
            [$pid]
        );

        $byCommunity = Database::select(
            "SELECT c.name, COUNT(m.id) as count
             FROM communities c LEFT JOIN members m ON m.community_id = c.id AND m.status = 'active' AND m.deleted_at IS NULL
             WHERE c.parish_id = ? GROUP BY c.id, c.name ORDER BY count DESC",
            [$pid]
        );

        $byStatus = Database::select(
            "SELECT status, COUNT(*) as count FROM members WHERE parish_id = ? AND deleted_at IS NULL GROUP BY status",
            [$pid]
        );

        $this->view('Reports/views/members', [
            'pageTitle'   => 'Ripoti ya Wanachama',
            'byGender'    => $byGender,
            'byCommunity' => $byCommunity,
            'byStatus'    => $byStatus,
        ]);
    }

    public function jumuiya(): void
    {
        $this->requirePermission('reports.view');
        $this->view('Reports/views/jumuiya', ['pageTitle' => 'Ripoti ya Jumuiya']);
    }

    public function export(): void
    {
        $this->requirePermission('reports.export');
        $this->verifyCsrf();

        $format = Request::post('format', 'pdf');
        $type   = Request::post('type', 'income');

        Audit::log('report.export', 'Reports', '', 0, [], ['format' => $format, 'type' => $type]);
        Session::flash('info', 'Kipengele cha usafirishaji kitakamilishwa hivi karibuni (Phase 2).');
        $this->redirect('/reports');
    }
}
