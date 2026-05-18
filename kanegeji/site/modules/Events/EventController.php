<?php

namespace App\Modules\Events;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;
use App\Core\QRCode;

class EventController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
    }

    public function index(): void
    {
        $this->requirePermission('events_view');
        $status = $_GET['status'] ?? '';
        $params = [Auth::parishId()];
        $where  = ['parish_id = ?'];
        if ($status) { $where[] = 'status = ?'; $params[] = $status; }

        $events = Database::select(
            "SELECT * FROM events WHERE " . implode(' AND ', $where) . " ORDER BY start_datetime DESC LIMIT 50",
            $params
        );
        $this->view('Events/views/index', compact('events', 'status'));
    }

    public function create(): void
    {
        $this->requirePermission('events_manage');
        $this->view('Events/views/create', []);
    }

    public function store(): void
    {
        $this->requirePermission('events_manage');
        $this->verifyCsrf();

        $parishId    = Auth::parishId();
        $number      = 'EVT-' . date('Y') . '-' . str_pad(rand(1, 9999), 4, '0', STR_PAD_LEFT);
        $isFree      = !empty($_POST['is_free']) ? 1 : 0;
        $price       = $isFree ? 0.00 : (float) ($_POST['ticket_price'] ?? 0);

        $id = Database::insert(
            "INSERT INTO events (parish_id, event_number, title, description, event_type, location, start_datetime, end_datetime, max_capacity, ticket_price, is_free, requires_registration, status, created_by, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())",
            [
                $parishId, $number,
                $_POST['title'],
                $_POST['description'] ?? null,
                $_POST['event_type'] ?? 'other',
                $_POST['location'] ?? null,
                $_POST['start_datetime'],
                $_POST['end_datetime'] ?: null,
                $_POST['max_capacity'] ?: null,
                $price, $isFree,
                !empty($_POST['requires_registration']) ? 1 : 0,
                $_POST['status'] ?? 'draft',
                Auth::id(),
            ]
        );

        Audit::log('create', 'Events', 'event', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => "Tukio {$number} limeundwa."];
        redirect('/events/' . $id);
    }

    public function show(int $id): void
    {
        $this->requirePermission('events_view');
        $event   = $this->getEvent($id);
        $tickets = Database::select(
            "SELECT * FROM event_tickets WHERE event_id = ? ORDER BY issued_at DESC LIMIT 20",
            [$id]
        );
        $ticketCount = Database::selectOne("SELECT COUNT(*) as cnt, SUM(price_paid) as revenue FROM event_tickets WHERE event_id = ?", [$id]);
        $this->view('Events/views/show', compact('event', 'tickets', 'ticketCount'));
    }

    public function edit(int $id): void
    {
        $this->requirePermission('events_manage');
        $event = $this->getEvent($id);
        $this->view('Events/views/edit', compact('event'));
    }

    public function update(int $id): void
    {
        $this->requirePermission('events_manage');
        $this->verifyCsrf();
        $this->getEvent($id);

        $isFree = !empty($_POST['is_free']) ? 1 : 0;
        Database::execute(
            "UPDATE events SET title=?, description=?, event_type=?, location=?, start_datetime=?, end_datetime=?, max_capacity=?, ticket_price=?, is_free=?, requires_registration=?, status=?, updated_at=NOW() WHERE id=? AND parish_id=?",
            [
                $_POST['title'],
                $_POST['description'] ?? null,
                $_POST['event_type'] ?? 'other',
                $_POST['location'] ?? null,
                $_POST['start_datetime'],
                $_POST['end_datetime'] ?: null,
                $_POST['max_capacity'] ?: null,
                $isFree ? 0 : (float) ($_POST['ticket_price'] ?? 0),
                $isFree,
                !empty($_POST['requires_registration']) ? 1 : 0,
                $_POST['status'] ?? 'draft',
                $id, Auth::parishId(),
            ]
        );

        Audit::log('update', 'Events', 'event', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Tukio limesasishwa.'];
        redirect('/events/' . $id);
    }

    public function issueTicket(int $id): void
    {
        $this->requirePermission('events_manage');
        $this->verifyCsrf();
        $event = $this->getEvent($id);

        $ticketNo = 'TKT-' . strtoupper(bin2hex(random_bytes(5)));
        $qrCode   = generateCode('TKT', 12);

        Database::execute(
            "INSERT INTO event_tickets (event_id, parish_id, ticket_number, qr_code, holder_name, holder_phone, holder_email, ticket_type, price_paid, payment_method, payment_reference, is_paid, is_used, issued_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,NOW())",
            [
                $id, Auth::parishId(),
                $ticketNo, $qrCode,
                $_POST['holder_name'],
                $_POST['holder_phone'] ?? null,
                $_POST['holder_email'] ?? null,
                $_POST['ticket_type'] ?? 'standard',
                $_POST['price_paid'] ?? 0,
                $_POST['payment_method'] ?? null,
                $_POST['payment_reference'] ?? null,
                !empty($_POST['is_paid']) ? 1 : 0,
            ]
        );

        Audit::log('issue_ticket', 'Events', 'event', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => "Tikiti {$ticketNo} imetolewa."];
        redirect('/events/' . $id);
    }

    public function verifyTicket(): void
    {
        $this->requirePermission('events_view');
        $qr     = trim($_GET['qr'] ?? '');
        $ticket = null;
        if ($qr) {
            $ticket = Database::selectOne(
                "SELECT et.*, e.title as event_title, e.start_datetime FROM event_tickets et JOIN events e ON e.id = et.event_id WHERE et.qr_code = ?",
                [$qr]
            );
        }
        $this->view('Events/views/verify', compact('ticket', 'qr'));
    }

    public function markUsed(): void
    {
        $this->requirePermission('events_manage');
        $this->verifyCsrf();
        $qr = $_POST['qr'] ?? '';
        if ($qr) {
            Database::execute("UPDATE event_tickets SET is_used = 1, used_at = NOW() WHERE qr_code = ?", [$qr]);
        }
        redirect('/events/verify?qr=' . urlencode($qr));
    }

    private function getEvent(int $id): array
    {
        $event = Database::selectOne("SELECT * FROM events WHERE id = ? AND parish_id = ?", [$id, Auth::parishId()]);
        if (!$event) redirect('/events');
        return $event;
    }
}
