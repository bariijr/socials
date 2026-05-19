<?php

namespace App\Modules\Notifications;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Notification;
use App\Core\Audit;

class NotificationController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
        $this->requirePermission('notifications_view');
    }

    public function index(): void
    {
        $pid  = Auth::parishId();
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = 20;
        $offset  = ($page - 1) * $perPage;

        $total = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM notification_broadcasts WHERE parish_id=?", [$pid]
        )['cnt'];

        $rows = Database::select(
            "SELECT nb.*, u.name as sent_by_name FROM notification_broadcasts nb
             LEFT JOIN users u ON u.id = nb.sent_by
             WHERE nb.parish_id=? ORDER BY nb.created_at DESC LIMIT {$perPage} OFFSET {$offset}",
            [$pid]
        );

        $communities = Database::select("SELECT id, name FROM communities WHERE parish_id=? AND active=1 ORDER BY name", [$pid]);

        $this->view('Notifications/views/index', compact('rows', 'total', 'page', 'perPage', 'communities'));
    }

    public function create(): void
    {
        $this->requirePermission('notifications_send');
        $pid         = Auth::parishId();
        $communities = Database::select("SELECT id, name FROM communities WHERE parish_id=? AND active=1 ORDER BY name", [$pid]);
        $this->view('Notifications/views/create', compact('communities'));
    }

    public function store(): void
    {
        $this->requirePermission('notifications_send');
        $this->verifyCsrf();

        $pid      = Auth::parishId();
        $title    = trim($_POST['title'] ?? '');
        $message  = trim($_POST['message'] ?? '');
        $channel  = $_POST['channel'] ?? 'sms';
        $audience = $_POST['audience'] ?? 'all';
        $audienceRef = $_POST['audience_ref'] ?? null;

        if (!$title || !$message) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Jaza sehemu zote zinazohitajika.'];
            redirect('/notifications/create');
        }

        $bcId = Database::insert(
            "INSERT INTO notification_broadcasts (parish_id, title, message, channel, audience, audience_ref, sent_by, status, created_at)
             VALUES (?,?,?,?,?,?,?,'draft',NOW())",
            [$pid, $title, $message, $channel, $audience, $audienceRef ?: null, Auth::id()]
        );

        // Fetch recipients
        $recipients = $this->getRecipients($pid, $audience, $audienceRef);
        $count = 0;

        foreach ($recipients as $r) {
            $phone = $r['phone'] ?? '';
            $email = $r['email'] ?? '';
            $name  = trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? ''));
            if (!$phone && !$email) continue;

            Notification::send($pid, $phone, $email, $name, 'broadcast', $title, $message, $bcId, 'broadcast');
            $count++;
        }

        Database::execute(
            "UPDATE notification_broadcasts SET status='sent', sent_count=?, sent_at=NOW() WHERE id=?",
            [$count, $bcId]
        );

        Audit::log('send', 'Notifications', 'notification_broadcasts', $bcId, [], ['count' => $count]);
        $_SESSION['flash'] = ['type' => 'success', 'message' => "Ujumbe umetumwa kwa watu {$count}."];
        redirect('/notifications');
    }

    private function getRecipients(int $parishId, string $audience, ?string $audienceRef): array
    {
        $base = "SELECT m.first_name, m.last_name, m.phone, m.email
                 FROM members m WHERE m.parish_id=? AND m.status='active' AND m.deleted_at IS NULL";

        return match ($audience) {
            'jumuiya' => Database::select($base . " AND m.community_id=?", [$parishId, (int) $audienceRef]),
            'role'    => Database::select(
                "SELECT u.name as first_name, '' as last_name, u.phone, u.email FROM users u
                 WHERE u.parish_id=? AND u.role=? AND u.deleted_at IS NULL",
                [$parishId, $audienceRef]
            ),
            default   => Database::select($base, [$parishId]),
        };
    }
}
