<?php

namespace App\Modules\Website;

use App\Core\Controller;
use App\Core\Database;
use App\Core\Audit;

class WebsiteController extends Controller
{
    private int $pid;

    public function __construct()
    {
        // Public controller — no auth required
        // Default to parish 1 for single-parish deployments
        $this->pid = (int) (Database::selectOne("SELECT id FROM parishes WHERE active=1 ORDER BY id ASC LIMIT 1")['id'] ?? 1);
    }

    public function home(): void
    {
        $pid = $this->pid;

        $announcements = Database::select(
            "SELECT * FROM announcements WHERE parish_id=? AND active=1
               AND (published_at IS NULL OR published_at <= NOW())
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY created_at DESC LIMIT 6",
            [$pid]
        );

        $campaigns = Database::select(
            "SELECT c.*,
                    COALESCE(SUM(cc.amount), 0) as raised
             FROM campaigns c
             LEFT JOIN campaign_contributions cc ON cc.campaign_id = c.id
             WHERE c.parish_id=? AND c.status='active'
             GROUP BY c.id ORDER BY c.created_at DESC LIMIT 3",
            [$pid]
        );

        $massSchedules = Database::select(
            "SELECT * FROM mass_schedules WHERE parish_id=? AND active=1 AND is_special=0 ORDER BY day_of_week ASC, mass_time ASC",
            [$pid]
        );

        $parish = Database::selectOne("SELECT * FROM parishes WHERE id=?", [$pid]);

        $this->view('Website/views/home', compact('announcements', 'campaigns', 'massSchedules', 'parish'), 'public');
    }

    public function give(): void
    {
        $pid = $this->pid;
        $campaigns = Database::select(
            "SELECT id, title FROM campaigns WHERE parish_id=? AND status='active' ORDER BY title",
            [$pid]
        );
        $parish = Database::selectOne("SELECT name, phone, email FROM parishes WHERE id=?", [$pid]);
        $this->view('Website/views/give', compact('campaigns', 'parish'), 'public');
    }

    public function storeDonation(): void
    {
        $pid = $this->pid;

        // Basic honeypot anti-spam
        if (!empty($_POST['website'])) redirect('/give');

        $amount = (float) ($_POST['amount'] ?? 0);
        if ($amount < 100) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Kiasi kidogo sana. Chini ya TZS 100.'];
            redirect('/give');
        }

        // Handle proof upload
        $proofFile = null;
        if (!empty($_FILES['proof']['name']) && $_FILES['proof']['error'] === UPLOAD_ERR_OK) {
            $ext     = strtolower(pathinfo($_FILES['proof']['name'], PATHINFO_EXTENSION));
            $allowed = ['jpg', 'jpeg', 'png', 'pdf'];
            if (in_array($ext, $allowed) && $_FILES['proof']['size'] < 5 * 1024 * 1024) {
                $dir  = BASE_PATH . '/storage/uploads/donations/';
                if (!is_dir($dir)) mkdir($dir, 0755, true);
                $proofFile = uniqid('don_', true) . '.' . $ext;
                move_uploaded_file($_FILES['proof']['tmp_name'], $dir . $proofFile);
            }
        }

        $id = Database::insert(
            "INSERT INTO online_donations (parish_id, campaign_id, donor_name, donor_phone, donor_email, amount, payment_method, reference_number, proof_file, status, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,'pending',NOW())",
            [
                $pid,
                !empty($_POST['campaign_id']) ? (int) $_POST['campaign_id'] : null,
                trim($_POST['donor_name'] ?? '') ?: 'Mchangiaji Asiyejulikana',
                trim($_POST['donor_phone'] ?? '') ?: null,
                trim($_POST['donor_email'] ?? '') ?: null,
                $amount,
                trim($_POST['payment_method'] ?? '') ?: null,
                trim($_POST['reference_number'] ?? '') ?: null,
                $proofFile,
            ]
        );

        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Asante! Mchango wako umepokelewa na unakaguliwa.'];
        redirect('/give');
    }

    public function massSchedule(): void
    {
        $pid  = $this->pid;
        $rows = Database::select(
            "SELECT * FROM mass_schedules WHERE parish_id=? AND active=1 ORDER BY day_of_week ASC, mass_time ASC",
            [$pid]
        );
        $days   = ['Jumapili','Jumatatu','Jumanne','Jumatano','Alhamisi','Ijumaa','Jumamosi'];
        $parish = Database::selectOne("SELECT name FROM parishes WHERE id=?", [$pid]);
        $this->view('Website/views/mass', compact('rows', 'days', 'parish'), 'public');
    }

    public function announcementsPublic(): void
    {
        $pid  = $this->pid;
        $rows = Database::select(
            "SELECT * FROM announcements WHERE parish_id=? AND active=1
               AND (published_at IS NULL OR published_at <= NOW())
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY type = 'urgent' DESC, created_at DESC LIMIT 30",
            [$pid]
        );
        $parish = Database::selectOne("SELECT name FROM parishes WHERE id=?", [$pid]);
        $this->view('Website/views/announcements', compact('rows', 'parish'), 'public');
    }

    // Donation management (for accountants)
    public function donations(): void
    {
        \App\Core\Auth::requirePermission('accounting.view');
        $pid    = \App\Core\Auth::parishId();
        $status = $_GET['status'] ?? 'pending';
        $rows   = Database::select(
            "SELECT d.*, c.title as campaign_title FROM online_donations d
             LEFT JOIN campaigns c ON c.id = d.campaign_id
             WHERE d.parish_id=? AND d.status=? ORDER BY d.created_at DESC",
            [$pid, $status]
        );
        $total = Database::selectOne(
            "SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM online_donations WHERE parish_id=? AND status=?",
            [$pid, $status]
        );
        $this->view('Website/views/donations_admin', compact('rows', 'total', 'status'));
    }

    public function verifyDonation(int $id): void
    {
        $this->verifyCsrf();
        \App\Core\Auth::requirePermission('accounting.create');
        $pid    = \App\Core\Auth::parishId();
        $don    = Database::selectOne("SELECT * FROM online_donations WHERE id=? AND parish_id=?", [$id, $pid]);
        if (!$don) redirect('/donations');

        Database::execute(
            "UPDATE online_donations SET status='verified', verified_by=?, verified_at=NOW() WHERE id=?",
            [\App\Core\Auth::id(), $id]
        );

        // Auto-create a transaction
        if ($don['amount'] > 0) {
            $defCat = Database::selectOne(
                "SELECT id FROM transaction_categories WHERE parish_id=? AND type='income' LIMIT 1",
                [$pid]
            );
            Database::insert(
                "INSERT INTO transactions (parish_id, type, amount, description, transaction_date, payment_method, status, recorded_by, created_at)
                 VALUES (?,'income',?,?,CURDATE(),?,'approved',?,NOW())",
                [
                    $pid,
                    $don['amount'],
                    'Mchango wa mtandaoni — ' . ($don['donor_name'] ?? 'Asiyejulikana'),
                    $don['payment_method'] ?? 'online',
                    \App\Core\Auth::id(),
                ]
            );
        }

        Audit::log('verify', 'Website', 'online_donation', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Mchango umethibitishwa.'];
        redirect('/donations');
    }
}
