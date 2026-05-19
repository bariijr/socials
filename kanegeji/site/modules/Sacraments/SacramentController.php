<?php

namespace App\Modules\Sacraments;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;

class SacramentController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
        $this->requirePermission('members.view');
    }

    public function index(): void
    {
        $filters = $_GET;
        $page    = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = 25;

        $where  = ['s.parish_id = ?'];
        $params = [Auth::parishId()];

        if (!empty($filters['type'])) {
            $where[]  = 's.type = ?';
            $params[] = $filters['type'];
        }
        if (!empty($filters['q'])) {
            $where[]  = '(m.first_name LIKE ? OR m.last_name LIKE ? OR s.certificate_no LIKE ?)';
            $q        = '%' . $filters['q'] . '%';
            $params   = array_merge($params, [$q, $q, $q]);
        }
        if (!empty($filters['year'])) {
            $where[]  = 'YEAR(s.date_received) = ?';
            $params[] = (int) $filters['year'];
        }

        $whereStr = implode(' AND ', $where);
        $total    = Database::selectOne("SELECT COUNT(*) as cnt FROM sacraments s JOIN members m ON m.id = s.member_id WHERE {$whereStr}", $params)['cnt'];
        $offset   = ($page - 1) * $perPage;

        $rows = Database::select(
            "SELECT s.*, m.first_name, m.last_name, m.member_number
             FROM sacraments s JOIN members m ON m.id = s.member_id
             WHERE {$whereStr} ORDER BY s.date_received DESC LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        $typeCounts = Database::select(
            "SELECT type, COUNT(*) as cnt FROM sacraments WHERE parish_id = ? GROUP BY type",
            [Auth::parishId()]
        );

        $this->view('Sacraments/views/index', compact('rows', 'total', 'page', 'perPage', 'filters', 'typeCounts'));
    }

    public function create(): void
    {
        $this->requirePermission('members.create');
        $memberId = (int) ($_GET['member_id'] ?? 0);
        $member   = $memberId ? Database::selectOne("SELECT * FROM members WHERE id = ? AND parish_id = ?", [$memberId, Auth::parishId()]) : null;
        $this->view('Sacraments/views/create', compact('member'));
    }

    public function store(): void
    {
        $this->requirePermission('members.create');
        $this->verifyCsrf();

        $memberId = (int) $_POST['member_id'];
        $member   = Database::selectOne("SELECT id FROM members WHERE id = ? AND parish_id = ?", [$memberId, Auth::parishId()]);
        if (!$member) redirect('/sacraments');

        $id = Database::insert(
            "INSERT INTO sacraments (parish_id, member_id, type, date_received, officiant, witnesses, certificate_no, notes, recorded_by, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,NOW())",
            [
                Auth::parishId(), $memberId,
                $_POST['type'],
                $_POST['date_received'] ?: null,
                $_POST['officiant'] ?? null,
                $_POST['witnesses'] ?? null,
                $_POST['certificate_no'] ?? null,
                $_POST['notes'] ?? null,
                Auth::id(),
            ]
        );

        // Update member flags
        if ($_POST['type'] === 'baptism') {
            Database::execute("UPDATE members SET baptised = 1 WHERE id = ?", [$memberId]);
        }
        if ($_POST['type'] === 'confirmation') {
            Database::execute("UPDATE members SET confirmed = 1 WHERE id = ?", [$memberId]);
        }

        Audit::log('create', 'Sacraments', 'sacrament', $id, [], ['type' => $_POST['type'], 'member_id' => $memberId]);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Sakramenti imehifadhiwa.'];
        redirect('/members/' . $memberId);
    }

    public function certificate(int $id): void
    {
        $sac = Database::selectOne(
            "SELECT s.*, m.first_name, m.last_name, m.date_of_birth, m.member_number,
                    p.name as parish_name, p.diocese
             FROM sacraments s
             JOIN members m ON m.id = s.member_id
             JOIN parishes p ON p.id = s.parish_id
             WHERE s.id = ? AND s.parish_id = ?",
            [$id, Auth::parishId()]
        );
        if (!$sac) redirect('/sacraments');

        $typeLabels = [
            'baptism'         => 'Cheti cha Ubatizo',
            'confirmation'    => 'Cheti cha Kipaimara',
            'first_communion' => 'Cheti cha Komunyo ya Kwanza',
            'marriage'        => 'Cheti cha Ndoa',
            'holy_orders'     => 'Cheti cha Upadre',
            'anointing'       => 'Cheti cha Upako',
        ];

        $pdf = \App\Core\PDF::make();
        $pdf->header();
        $pdf->footer();

        ob_start();
        require BASE_PATH . '/modules/Sacraments/views/certificate_pdf.php';
        $html = ob_get_clean();

        $css = '@page { size: A4; margin: 2cm; } body { font-family: serif; }';
        $pdf->html($html, $css);
        $filename = 'cheti_' . str_replace(' ', '_', strtolower($sac['type'])) . '_' . $sac['id'] . '.pdf';
        $pdf->download($filename);
    }

    public function destroy(int $id): void
    {
        $this->requirePermission('members.edit');
        $this->verifyCsrf();
        $sac = Database::selectOne("SELECT * FROM sacraments WHERE id = ? AND parish_id = ?", [$id, Auth::parishId()]);
        if (!$sac) redirect('/sacraments');

        Database::execute("DELETE FROM sacraments WHERE id = ?", [$id]);
        Audit::log('delete', 'Sacraments', 'sacrament', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Rekodi ya sakramenti imefutwa.'];
        redirect('/members/' . $sac['member_id']);
    }
}
