<?php

namespace App\Modules\Portal;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;

class PortalController extends Controller
{
    private int $pid;
    private int $uid;
    private ?array $member;

    public function __construct()
    {
        $this->requireAuth();
        $this->pid    = Auth::parishId();
        $this->uid    = Auth::id();
        $this->member = Database::selectOne(
            "SELECT * FROM members WHERE user_id=? AND parish_id=? AND deleted_at IS NULL",
            [$this->uid, $this->pid]
        );
    }

    public function dashboard(): void
    {
        $member = $this->member;
        $pid    = $this->pid;
        $uid    = $this->uid;

        // Contributions (member's transactions)
        $recentContributions = $member ? Database::select(
            "SELECT t.*, tc.name as category_name FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             WHERE t.parish_id=? AND t.member_id=? AND t.type='income' AND t.deleted_at IS NULL
             ORDER BY t.created_at DESC LIMIT 10",
            [$pid, $member['id']]
        ) : [];

        // Member's pledges
        $pledges = $member ? Database::select(
            "SELECT p.*, c.title as campaign_title FROM pledges p
             LEFT JOIN campaigns c ON c.id = p.campaign_id
             WHERE p.member_id=? AND p.parish_id=?
             ORDER BY p.created_at DESC LIMIT 10",
            [$member['id'], $pid]
        ) : [];

        // Announcements (last 5 active)
        $announcements = Database::select(
            "SELECT * FROM announcements WHERE parish_id=? AND active=1
               AND (published_at IS NULL OR published_at <= NOW())
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY created_at DESC LIMIT 5",
            [$pid]
        );

        // Mass schedules
        $massSchedules = Database::select(
            "SELECT * FROM mass_schedules WHERE parish_id=? AND active=1 ORDER BY day_of_week ASC, mass_time ASC",
            [$pid]
        );

        $this->view('Portal/views/dashboard', compact('member', 'recentContributions', 'pledges', 'announcements', 'massSchedules'));
    }

    public function contributions(): void
    {
        if (!$this->member) redirect('/portal');

        $page    = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = 25;
        $offset  = ($page - 1) * $perPage;
        $mid     = $this->member['id'];
        $pid     = $this->pid;

        $total = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM transactions WHERE parish_id=? AND member_id=? AND type='income' AND deleted_at IS NULL",
            [$pid, $mid]
        )['cnt'];

        $rows = Database::select(
            "SELECT t.*, tc.name as category_name FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             WHERE t.parish_id=? AND t.member_id=? AND t.type='income' AND t.deleted_at IS NULL
             ORDER BY t.transaction_date DESC LIMIT {$perPage} OFFSET {$offset}",
            [$pid, $mid]
        );

        $yearTotal = Database::selectOne(
            "SELECT COALESCE(SUM(amount),0) as total FROM transactions
             WHERE parish_id=? AND member_id=? AND type='income' AND status='approved'
               AND YEAR(transaction_date)=YEAR(CURDATE()) AND deleted_at IS NULL",
            [$pid, $mid]
        )['total'];

        $member = $this->member;
        $this->view('Portal/views/contributions', compact('rows', 'total', 'page', 'perPage', 'yearTotal', 'member'));
    }

    public function receipts(): void
    {
        if (!$this->member) redirect('/portal');

        $pid = $this->pid;
        $mid = $this->member['id'];

        $rows = Database::select(
            "SELECT r.*, t.amount, t.description, t.transaction_date
             FROM receipts r JOIN transactions t ON t.id = r.transaction_id
             WHERE t.parish_id=? AND t.member_id=?
             ORDER BY r.created_at DESC LIMIT 50",
            [$pid, $mid]
        );

        $member = $this->member;
        $this->view('Portal/views/receipts', compact('rows', 'member'));
    }
}
