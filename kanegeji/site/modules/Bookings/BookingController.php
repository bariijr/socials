<?php

namespace App\Modules\Bookings;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;
use App\Core\Notification;

class BookingController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
    }

    public function index(): void
    {
        $this->requirePermission('bookings_view');
        $status = $_GET['status'] ?? '';
        $params = [Auth::parishId()];
        $where  = ['hb.parish_id = ?'];
        if ($status) { $where[] = 'hb.status = ?'; $params[] = $status; }

        $bookings = Database::select(
            "SELECT hb.*, h.name as hall_name FROM hall_bookings hb LEFT JOIN halls h ON h.id = hb.hall_id WHERE " . implode(' AND ', $where) . " ORDER BY hb.start_datetime DESC LIMIT 50",
            $params
        );
        $halls = Database::select("SELECT * FROM halls WHERE parish_id = ? AND is_active = 1", [Auth::parishId()]);
        $this->view('Bookings/views/index', compact('bookings', 'halls', 'status'));
    }

    public function create(): void
    {
        $this->requirePermission('bookings_manage');
        $halls = Database::select("SELECT * FROM halls WHERE parish_id = ? AND is_active = 1", [Auth::parishId()]);
        $this->view('Bookings/views/create', compact('halls'));
    }

    public function store(): void
    {
        $this->requirePermission('bookings_manage');
        $this->verifyCsrf();

        $hallId  = (int) $_POST['hall_id'];
        $hall    = Database::selectOne("SELECT * FROM halls WHERE id = ? AND parish_id = ?", [$hallId, Auth::parishId()]);
        if (!$hall) redirect('/bookings');

        // Conflict check
        $conflict = Database::selectOne(
            "SELECT id FROM hall_bookings WHERE hall_id = ? AND status NOT IN ('rejected','cancelled') AND start_datetime < ? AND end_datetime > ?",
            [$hallId, $_POST['end_datetime'], $_POST['start_datetime']]
        );
        if ($conflict) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Ukumbi huu una uhifadhi mwingine katika kipindi hicho.'];
            redirect('/bookings/create');
        }

        $number = 'BKG-' . date('Ymd') . '-' . str_pad(rand(1, 999), 3, '0', STR_PAD_LEFT);

        // Calculate total
        $start   = new \DateTime($_POST['start_datetime']);
        $end     = new \DateTime($_POST['end_datetime']);
        $hours   = max(1, (int) $start->diff($end)->h + $start->diff($end)->days * 24);
        $total   = $hall['hourly_rate'] > 0 ? $hall['hourly_rate'] * $hours : $hall['daily_rate'];
        $deposit = (float) ($_POST['deposit_paid'] ?? 0);
        $balance = max(0, $total - $deposit);

        $id = Database::insert(
            "INSERT INTO hall_bookings (parish_id, booking_number, hall_id, booker_name, booker_phone, booker_email, purpose, event_type, start_datetime, end_datetime, expected_guests, total_amount, deposit_paid, balance_due, payment_status, status, notes, created_by, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())",
            [
                Auth::parishId(), $number, $hallId,
                $_POST['booker_name'], $_POST['booker_phone'],
                $_POST['booker_email'] ?? null,
                $_POST['purpose'], $_POST['event_type'] ?? null,
                $_POST['start_datetime'], $_POST['end_datetime'],
                $_POST['expected_guests'] ?: null,
                $total, $deposit, $balance,
                $deposit >= $total ? 'paid' : ($deposit > 0 ? 'partial' : 'unpaid'),
                'pending', $_POST['notes'] ?? null, Auth::id(),
            ]
        );

        Audit::log('create', 'Bookings', 'hall_booking', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => "Ombi la uhifadhi {$number} limewasilishwa."];
        redirect('/bookings/' . $id);
    }

    public function show(int $id): void
    {
        $this->requirePermission('bookings_view');
        $booking = $this->getBooking($id);
        $hall    = Database::selectOne("SELECT * FROM halls WHERE id = ?", [$booking['hall_id']]);
        $this->view('Bookings/views/show', compact('booking', 'hall'));
    }

    public function approve(int $id): void
    {
        $this->requirePermission('bookings_approve');
        $this->verifyCsrf();
        $booking = $this->getBooking($id);

        Database::execute(
            "UPDATE hall_bookings SET status = 'approved', approved_by = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ? AND parish_id = ?",
            [Auth::id(), $id, Auth::parishId()]
        );

        // Notify booker
        Notification::send(
            Auth::parishId(),
            $booking['booker_phone'],
            $booking['booker_email'] ?? '',
            $booking['booker_name'],
            'booking_approved',
            'Ombi la Uhifadhi Limeidhinishwa',
            "Heshima {$booking['booker_name']},\n\nOmbi lako la uhifadhi wa ukumbi (Nambari: {$booking['booking_number']}) limeidhinishwa.\n\nTarehe: " . formatDate($booking['start_datetime']) . " — " . formatDate($booking['end_datetime']) . "\nJumla: TZS " . number_format($booking['total_amount']) . "\nBaki: TZS " . number_format($booking['balance_due']) . "\n\nAsante.",
            $id, 'hall_booking'
        );

        Audit::log('approve', 'Bookings', 'hall_booking', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Ombi la uhifadhi limeidhinishwa.'];
        redirect('/bookings/' . $id);
    }

    public function reject(int $id): void
    {
        $this->requirePermission('bookings_approve');
        $this->verifyCsrf();
        $booking = $this->getBooking($id);
        $reason  = $_POST['rejection_reason'] ?? 'Haitimii vigezo';

        Database::execute(
            "UPDATE hall_bookings SET status = 'rejected', rejection_reason = ?, updated_at = NOW() WHERE id = ? AND parish_id = ?",
            [$reason, $id, Auth::parishId()]
        );

        Notification::send(
            Auth::parishId(),
            $booking['booker_phone'],
            $booking['booker_email'] ?? '',
            $booking['booker_name'],
            'booking_rejected',
            'Ombi la Uhifadhi Limekataliwa',
            "Heshima {$booking['booker_name']},\n\nOmbi lako (Nambari: {$booking['booking_number']}) limekataliwa.\nSababu: {$reason}\n\nTafadhali wasiliana nasi kwa maelezo zaidi.",
            $id, 'hall_booking'
        );

        Audit::log('reject', 'Bookings', 'hall_booking', $id);
        $_SESSION['flash'] = ['type' => 'error', 'message' => 'Ombi limekataliwa.'];
        redirect('/bookings/' . $id);
    }

    public function updatePayment(int $id): void
    {
        $this->requirePermission('bookings_manage');
        $this->verifyCsrf();
        $booking  = $this->getBooking($id);
        $deposit  = (float) ($_POST['deposit_paid'] ?? $booking['deposit_paid']);
        $balance  = max(0, $booking['total_amount'] - $deposit);
        $payStatus = $balance <= 0 ? 'paid' : ($deposit > 0 ? 'partial' : 'unpaid');

        Database::execute(
            "UPDATE hall_bookings SET deposit_paid = ?, balance_due = ?, payment_status = ?, updated_at = NOW() WHERE id = ? AND parish_id = ?",
            [$deposit, $balance, $payStatus, $id, Auth::parishId()]
        );

        Audit::log('payment_update', 'Bookings', 'hall_booking', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Malipo yamesasishwa.'];
        redirect('/bookings/' . $id);
    }

    private function getBooking(int $id): array
    {
        $booking = Database::selectOne("SELECT * FROM hall_bookings WHERE id = ? AND parish_id = ?", [$id, Auth::parishId()]);
        if (!$booking) redirect('/bookings');
        return $booking;
    }
}
