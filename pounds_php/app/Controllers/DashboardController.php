<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;

class DashboardController extends Controller {
    public function kpis() {
        $this->requireAuth();

        $db = Database::getInstance();

        $kpis = [
            'totalLoans' => $db->fetch("SELECT COUNT(*) as count FROM loans")['count'],
            'activeLoans' => $db->fetch("SELECT COUNT(*) as count FROM loans WHERE status = 'disbursed'")['count'],
            'overdueLoans' => $db->fetch("SELECT COUNT(*) as count FROM loans WHERE status = 'overdue'")['count'],
            'totalUsers' => $db->fetch("SELECT COUNT(*) as count FROM users")['count'],
            'totalIssued' => (float) ($db->fetch("SELECT COALESCE(SUM(principalAmount), 0) as total FROM loans WHERE status NOT IN ('draft', 'rejected')")['total'] ?? 0),
            'totalRepaid' => (float) ($db->fetch("SELECT COALESCE(SUM(totalRepaid), 0) as total FROM loans")['total'] ?? 0),
            'totalOutstanding' => (float) ($db->fetch("SELECT COALESCE(SUM(outstandingBalance), 0) as total FROM loans WHERE status IN ('disbursed', 'overdue')")['total'] ?? 0),
            'totalPenalties' => (float) ($db->fetch("SELECT COALESCE(SUM(amount), 0) as total FROM penalties WHERE waived = 0")['total'] ?? 0),
            'pendingKyc' => $db->fetch("SELECT COUNT(*) as count FROM kyc_forms WHERE status = 'submitted'")['count'],
        ];

        $totalIssued = $kpis['totalIssued'];
        $kpis['collectionRate'] = $totalIssued > 0 ? number_format(($kpis['totalRepaid'] / $totalIssued) * 100, 2) : '0.00';

        return $this->json($kpis);
    }

    public function trend() {
        $this->requireAuth();

        $db = Database::getInstance();
        $months = (int) $this->request->getQuery('months', 6);

        $result = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $date = date('Y-m-01', strtotime("-$i months"));
            $nextDate = date('Y-m-01', strtotime("+1 month", strtotime($date)));

            $issued = (float) ($db->fetch(
                "SELECT COALESCE(SUM(principalAmount), 0) as total FROM loans WHERE createdAt >= ? AND createdAt < ? AND status NOT IN ('draft', 'rejected')",
                [$date, $nextDate]
            )['total'] ?? 0);

            $repaid = (float) ($db->fetch(
                "SELECT COALESCE(SUM(amount), 0) as total FROM repayments WHERE createdAt >= ? AND createdAt < ?",
                [$date, $nextDate]
            )['total'] ?? 0);

            $result[] = [
                'month' => date('M Y', strtotime($date)),
                'issued' => $issued,
                'repaid' => $repaid
            ];
        }

        return $this->json($result);
    }

    public function breakdown() {
        $this->requireAuth();

        $db = Database::getInstance();
        $statuses = ['draft', 'submitted', 'approved', 'disbursed', 'overdue', 'closed', 'rejected'];

        $result = [];
        foreach ($statuses as $status) {
            $count = (int) $db->fetch("SELECT COUNT(*) as count FROM loans WHERE status = ?", [$status])['count'];
            if ($count > 0) {
                $result[] = ['status' => $status, 'count' => $count];
            }
        }

        return $this->json($result);
    }

    public function activity() {
        $this->requireAuth();

        $db = Database::getInstance();

        $recentLoans = $db->fetchAll(
            "SELECT l.*, u.firstName, u.lastName FROM loans l JOIN users u ON l.borrowerId = u.id ORDER BY l.createdAt DESC LIMIT 5"
        );

        $recentRepayments = $db->fetchAll(
            "SELECT r.*, l.loanNumber FROM repayments r JOIN loans l ON r.loanId = l.id ORDER BY r.createdAt DESC LIMIT 5"
        );

        return $this->json([
            'recentLoans' => $recentLoans,
            'recentRepayments' => $recentRepayments
        ]);
    }
}
