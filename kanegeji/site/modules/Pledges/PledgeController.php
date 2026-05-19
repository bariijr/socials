<?php

namespace App\Modules\Pledges;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;
use App\Core\Notification;

class PledgeController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
        $this->requirePermission('accounting.view');
    }

    public function index(): void
    {
        $filters = $_GET;
        $page    = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = 20;
        $pid     = Auth::parishId();

        $where  = ['p.parish_id = ?'];
        $params = [$pid];

        if (!empty($filters['campaign_id'])) { $where[] = 'p.campaign_id = ?'; $params[] = $filters['campaign_id']; }
        if (!empty($filters['status']))      { $where[] = 'p.status = ?';      $params[] = $filters['status']; }

        $whereStr = implode(' AND ', $where);
        $total    = Database::selectOne("SELECT COUNT(*) as cnt FROM pledges p WHERE {$whereStr}", $params)['cnt'];
        $offset   = ($page - 1) * $perPage;

        $rows = Database::select(
            "SELECT p.*, c.title as campaign_title, m.first_name, m.last_name, m.phone
             FROM pledges p
             LEFT JOIN campaigns c ON c.id = p.campaign_id
             LEFT JOIN members m ON m.id = p.member_id
             WHERE {$whereStr}
             ORDER BY p.created_at DESC LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        $campaigns = Database::select("SELECT id, title FROM campaigns WHERE parish_id = ? ORDER BY title", [$pid]);
        $summary   = Database::selectOne(
            "SELECT SUM(amount_pledged) as total_pledged, SUM(amount_paid) as total_paid, COUNT(*) as total FROM pledges WHERE parish_id = ?",
            [$pid]
        );

        $this->view('Pledges/views/index', compact('rows', 'total', 'page', 'perPage', 'campaigns', 'summary', 'filters'));
    }

    public function create(): void
    {
        $this->requirePermission('accounting.create');
        $campaigns = Database::select("SELECT id, title FROM campaigns WHERE parish_id = ? AND status = 'active' ORDER BY title", [Auth::parishId()]);
        $this->view('Pledges/views/create', compact('campaigns'));
    }

    public function store(): void
    {
        $this->requirePermission('accounting.create');
        $this->verifyCsrf();

        $memberId = !empty($_POST['member_id']) ? (int) $_POST['member_id'] : null;

        $id = Database::insert(
            "INSERT INTO pledges (parish_id, campaign_id, member_id, donor_name, amount_pledged, amount_paid, due_date, status, notes, created_at)
             VALUES (?,?,?,?,?,0,?,?,?,NOW())",
            [
                Auth::parishId(),
                $_POST['campaign_id'],
                $memberId,
                $_POST['donor_name'] ?: null,
                $_POST['amount_pledged'],
                $_POST['due_date'] ?: null,
                'pending',
                $_POST['notes'] ?? null,
            ]
        );

        Audit::log('create', 'Pledges', 'pledge', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Ahadi imehifadhiwa.'];
        redirect('/pledges/' . $id);
    }

    public function show(int $id): void
    {
        $pledge = $this->getPledge($id);
        $this->view('Pledges/views/show', compact('pledge'));
    }

    public function recordPayment(int $id): void
    {
        $this->requirePermission('accounting.create');
        $this->verifyCsrf();
        $pledge  = $this->getPledge($id);
        $amount  = (float) $_POST['payment_amount'];
        $newPaid = min((float) $pledge['amount_pledged'], (float) $pledge['amount_paid'] + $amount);
        $status  = $newPaid >= (float) $pledge['amount_pledged'] ? 'fulfilled' : 'partial';

        Database::execute(
            "UPDATE pledges SET amount_paid = ?, status = ? WHERE id = ?",
            [$newPaid, $status, $id]
        );

        // Notify member
        if ($pledge['member_id'] && $pledge['phone']) {
            Notification::send(
                Auth::parishId(), $pledge['phone'], '', $pledge['donor_name'] ?? '',
                'pledge_payment', 'Malipo ya Ahadi Yamepokelewa',
                "Heshima {$pledge['donor_name']},\n\nMalipo ya TZS " . number_format($amount) . " kwa ahadi yako ya kampeni '{$pledge['campaign_title']}' yamepokelewa.\nJumla iliyolipwa: TZS " . number_format($newPaid) . " / TZS " . number_format($pledge['amount_pledged']) . ".\n" . ($status === 'fulfilled' ? "Ahadi yako imekamilika! Asante sana." : "Baki: TZS " . number_format($pledge['amount_pledged'] - $newPaid)),
                $id, 'pledge'
            );
        }

        Audit::log('payment', 'Pledges', 'pledge', $id, [], ['amount' => $amount]);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Malipo ya TZS ' . number_format($amount) . ' yamehifadhiwa.'];
        redirect('/pledges/' . $id);
    }

    private function getPledge(int $id): array
    {
        $pledge = Database::selectOne(
            "SELECT p.*, c.title as campaign_title, m.first_name, m.last_name, m.phone,
                    COALESCE(m.first_name, p.donor_name) as donor_name
             FROM pledges p
             LEFT JOIN campaigns c ON c.id = p.campaign_id
             LEFT JOIN members m ON m.id = p.member_id
             WHERE p.id = ? AND p.parish_id = ?",
            [$id, Auth::parishId()]
        );
        if (!$pledge) redirect('/pledges');
        return $pledge;
    }
}
