<?php

namespace App\Modules\Admin;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;
use App\Core\Channels\{Email, SMS, WhatsApp};

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

        $app = Database::selectOne("SELECT * FROM member_applications WHERE id=?", [$id]);
        if (!$app || $app['status'] !== 'pending') {
            redirect('/admin/applications');
        }

        // 1. Create member record
        $memberId = Database::insert(
            "INSERT INTO members
                (parish_id, first_name, last_name, phone, email, date_of_birth, gender,
                 community_name, status, active, created_at)
             VALUES (?,?,?,?,?,?,?,?,'active',1,NOW())",
            [
                $app['parish_id'], $app['first_name'], $app['last_name'],
                $app['phone'] ?: null, $app['email'] ?: null,
                $app['date_of_birth'] ?: null, $app['gender'] ?: null,
                $app['community_name'] ?: null,
            ]
        );

        // 2. Create user account with temporary password
        $tempPass = bin2hex(random_bytes(4)); // 8-char hex
        $hash     = password_hash($tempPass, PASSWORD_BCRYPT, ['cost' => 12]);
        Database::insert(
            "INSERT INTO users (parish_id, member_id, name, email, password, role, active, created_at)
             VALUES (?,?,?,?,?,'member',1,NOW())",
            [
                $app['parish_id'], $memberId,
                $app['first_name'] . ' ' . $app['last_name'],
                $app['email'] ?: null,
                $hash,
            ]
        );

        // 3. Mark application approved
        Database::execute(
            "UPDATE member_applications SET status='approved', reviewed_by=?, reviewed_at=NOW() WHERE id=?",
            [Auth::id(), $id]
        );

        Audit::log('approve', 'Admin', 'member_applications', $id);

        // 4. Notify applicant by email
        $appUrl   = rtrim(env('APP_URL', ''), '/');
        $appName  = env('APP_NAME', 'Parish ERP');
        $fullName = $app['first_name'] . ' ' . $app['last_name'];
        if ($app['email']) {
            $html = "<p>Ndugu <strong>{$fullName}</strong>,</p>
                     <p>Ombi lako la kujisajili limeidhinishwa. Unaweza sasa kuingia kwenye mfumo.</p>
                     <ul>
                       <li><strong>Barua pepe:</strong> {$app['email']}</li>
                       <li><strong>Nywila ya muda:</strong> {$tempPass}</li>
                     </ul>
                     <p>Bonyeza hapa kuingia: <a href='{$appUrl}/login'>{$appUrl}/login</a></p>
                     <p>Badilisha nywila yako baada ya kuingia mara ya kwanza.</p>
                     <p>— {$appName}</p>";
            Email::send($app['email'], $fullName, "Karibu — {$appName}", $html);
        }

        // 5. Notify applicant: WhatsApp first, fall back to SMS
        if ($app['phone']) {
            $msg = "Ndugu {$fullName}, ombi lako la kujisajili limeidhinishwa.\n\n"
                 . "Ingia kwenye: {$appUrl}/login\n"
                 . "Nywila ya muda: {$tempPass}\n\n"
                 . "Tafadhali badilisha nywila baada ya kuingia mara ya kwanza.\n— {$appName}";
            $waSent = WhatsApp::send($app['phone'], $msg);
            if (!$waSent) {
                // WhatsApp failed — fall back to plain SMS
                $smsMsg = "Ndugu {$fullName}, umeidhinishwa. Ingia: {$appUrl}/login "
                        . "Nywila: {$tempPass} (Badilisha baada ya kuingia) — {$appName}";
                SMS::send($app['phone'], $smsMsg);
            }
        }

        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Ombi limeidhinishwa na mwanachama ameundwa.'];
        redirect('/admin/applications');
    }

    public function rejectApplication(int $id): void
    {
        $this->verifyCsrf();

        $app = Database::selectOne("SELECT * FROM member_applications WHERE id=?", [$id]);

        Database::execute(
            "UPDATE member_applications SET status='rejected', reviewed_by=?, reviewed_at=NOW(), notes=? WHERE id=?",
            [Auth::id(), trim($_POST['reason'] ?? ''), $id]
        );

        // Notify by email
        if ($app && $app['email']) {
            $appName  = env('APP_NAME', 'Parish ERP');
            $fullName = $app['first_name'] . ' ' . $app['last_name'];
            $reason   = trim($_POST['reason'] ?? '');
            $html     = "<p>Ndugu <strong>{$fullName}</strong>,</p>
                         <p>Ombi lako la kujisajili halikuweza kukubaliwa kwa sasa.</p>"
                      . ($reason ? "<p>Sababu: {$reason}</p>" : '')
                      . "<p>Kwa maswali, wasiliana na ofisi ya parokia.</p>
                         <p>— {$appName}</p>";
            Email::send($app['email'], $fullName, "Kuhusu Ombi Lako — {$appName}", $html);
        }

        $_SESSION['flash'] = ['type' => 'info', 'message' => 'Ombi limekataliwa.'];
        redirect('/admin/applications');
    }
}
