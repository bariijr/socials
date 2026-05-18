<?php

namespace App\Modules\Dashboard;

use App\Core\{Auth, Database};

class DashboardService
{
    private int $parishId;

    public function __construct()
    {
        $this->parishId = Auth::parishId();
    }

    public function getSummary(): array
    {
        $month = date('Y-m');

        $income = Database::selectOne(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions
             WHERE parish_id = ? AND type = 'income' AND status = 'approved'
             AND DATE_FORMAT(transaction_date, '%Y-%m') = ? AND deleted_at IS NULL",
            [$this->parishId, $month]
        )['total'] ?? 0;

        $expenses = Database::selectOne(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions
             WHERE parish_id = ? AND type = 'expense' AND status = 'approved'
             AND DATE_FORMAT(transaction_date, '%Y-%m') = ? AND deleted_at IS NULL",
            [$this->parishId, $month]
        )['total'] ?? 0;

        $pendingTx = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM transactions WHERE parish_id = ? AND status = 'pending' AND deleted_at IS NULL",
            [$this->parishId]
        )['cnt'] ?? 0;

        $members = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM members WHERE parish_id = ? AND status = 'active' AND deleted_at IS NULL",
            [$this->parishId]
        )['cnt'] ?? 0;

        $communities = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM communities WHERE parish_id = ? AND active = 1",
            [$this->parishId]
        )['cnt'] ?? 0;

        $activeCampaigns = Database::selectOne(
            "SELECT COUNT(*) as cnt, COALESCE(SUM(target_amount), 0) as target FROM campaigns
             WHERE parish_id = ? AND status = 'active'",
            [$this->parishId]
        );

        $campaignRaised = Database::selectOne(
            "SELECT COALESCE(SUM(cc.amount), 0) as raised
             FROM campaign_contributions cc
             JOIN campaigns c ON c.id = cc.campaign_id
             WHERE c.parish_id = ? AND c.status = 'active'",
            [$this->parishId]
        )['raised'] ?? 0;

        return [
            'income'           => (float) $income,
            'expenses'         => (float) $expenses,
            'net'              => (float) $income - (float) $expenses,
            'pending_tx'       => (int) $pendingTx,
            'members'          => (int) $members,
            'communities'      => (int) $communities,
            'active_campaigns' => (int) ($activeCampaigns['cnt'] ?? 0),
            'campaign_raised'  => (float) $campaignRaised,
            'campaign_target'  => (float) ($activeCampaigns['target'] ?? 0),
            'month'            => date('F Y'),
        ];
    }

    public function getRecentTransactions(int $limit = 8): array
    {
        return Database::select(
            "SELECT t.*, tc.name as category_name, u.name as recorded_by_name
             FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             LEFT JOIN users u ON u.id = t.recorded_by
             WHERE t.parish_id = ? AND t.deleted_at IS NULL
             ORDER BY t.created_at DESC LIMIT {$limit}",
            [$this->parishId]
        );
    }

    public function getMonthlyChartData(int $months = 6): array
    {
        $rows = Database::select(
            "SELECT DATE_FORMAT(transaction_date, '%Y-%m') as month,
                    type,
                    SUM(amount) as total
             FROM transactions
             WHERE parish_id = ? AND status = 'approved' AND deleted_at IS NULL
             AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL {$months} MONTH)
             GROUP BY month, type
             ORDER BY month ASC",
            [$this->parishId]
        );

        $data   = [];
        $labels = [];

        for ($i = $months - 1; $i >= 0; $i--) {
            $key      = date('Y-m', strtotime("-{$i} months"));
            $labels[] = date('M Y', strtotime("-{$i} months"));
            $data[$key] = ['income' => 0, 'expense' => 0];
        }

        foreach ($rows as $row) {
            $key = $row['month'];
            if (isset($data[$key])) {
                $data[$key][$row['type']] = (float) $row['total'];
            }
        }

        return [
            'labels'   => $labels,
            'income'   => array_column($data, 'income'),
            'expenses' => array_column($data, 'expense'),
        ];
    }

    public function getTopCommunities(int $limit = 5): array
    {
        return Database::select(
            "SELECT c.name, COUNT(m.id) as member_count,
                    COALESCE(SUM(t.amount), 0) as contributions
             FROM communities c
             LEFT JOIN members m ON m.community_id = c.id AND m.status = 'active' AND m.deleted_at IS NULL
             LEFT JOIN transactions t ON t.community_id = c.id AND t.status = 'approved' AND t.type = 'income'
                AND DATE_FORMAT(t.transaction_date, '%Y') = YEAR(CURDATE())
             WHERE c.parish_id = ? AND c.active = 1
             GROUP BY c.id, c.name
             ORDER BY contributions DESC LIMIT {$limit}",
            [$this->parishId]
        );
    }
}
