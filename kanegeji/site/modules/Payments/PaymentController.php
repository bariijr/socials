<?php

namespace App\Modules\Payments;

use App\Core\{Audit, Auth, Controller, Database, Payment, Request, Session, Selcom};

class PaymentController extends Controller
{
    // ── Checkout page ─────────────────────────────────────────

    public function checkout(): void
    {
        $this->requireAuth();

        $purpose     = Request::get('purpose', 'donation');
        $referenceId = (int) Request::get('ref', 0);
        $amount      = (float) Request::get('amount', 0);

        // Resolve a campaign or pledge pre-fill
        $campaign = $pledge = null;
        if ($purpose === 'donation' && $referenceId) {
            $campaign = Database::selectOne(
                "SELECT id, title, goal_amount FROM campaigns WHERE id=? AND parish_id=? AND deleted_at IS NULL",
                [$referenceId, Auth::parishId()]
            );
        }
        if ($purpose === 'pledge' && $referenceId) {
            $pledge = Database::selectOne(
                "SELECT p.*, c.title as campaign_title
                 FROM pledges p JOIN campaigns c ON c.id=p.campaign_id
                 WHERE p.id=? AND p.member_id IN (SELECT id FROM members WHERE parish_id=?)",
                [$referenceId, Auth::parishId()]
            );
            if ($pledge) {
                $amount = $pledge['amount_pledged'] - $pledge['amount_paid'];
            }
        }

        $member = Database::selectOne(
            "SELECT * FROM members WHERE id = (SELECT member_id FROM users WHERE id=? LIMIT 1)",
            [Auth::id()]
        );

        $this->view('Payments/views/checkout', compact('purpose', 'referenceId', 'amount', 'campaign', 'pledge', 'member'));
    }

    // ── Initiate STK push ─────────────────────────────────────

    public function initiate(): void
    {
        $this->requireAuth();
        $this->verifyCsrf();

        $phone       = trim(Request::post('phone', ''));
        $amount      = (float) Request::post('amount', 0);
        $provider    = Request::post('provider', 'mpesa');
        $purpose     = Request::post('purpose', 'donation');
        $referenceId = (int) Request::post('reference_id', 0);

        if (!$phone || $amount < 100) {
            Session::flash('error', 'Tafadhali jaza namba ya simu na kiasi (angalau TZS 100).');
            $this->redirect('/pay?' . http_build_query(compact('purpose', 'referenceId', 'amount')));
        }

        $externalId = 'KAN-' . Auth::parishId() . '-' . time() . '-' . random_int(100, 999);
        $memberId   = null;
        $buyerName  = 'Mwanachama';
        $buyerEmail = env('MAIL_FROM_ADDRESS', 'noreply@example.com');

        // Fetch buyer details for Selcom order
        $userRow = Database::selectOne(
            "SELECT u.email, m.id as member_id, CONCAT(m.first_name,' ',m.last_name) as full_name
             FROM users u
             LEFT JOIN members m ON m.id = u.member_id
             WHERE u.id = ?",
            [Auth::id()]
        );
        if ($userRow) {
            $memberId   = $userRow['member_id'];
            $buyerEmail = $userRow['email'] ?: $buyerEmail;
            $buyerName  = trim($userRow['full_name'] ?? '') ?: $buyerName;
        }

        // Persist payment record (pending)
        $paymentId = Database::insert(
            "INSERT INTO payments (parish_id, member_id, external_id, provider, phone, amount, purpose, reference_id, status, created_at)
             VALUES (?,?,?,?,?,?,?,?,'pending',NOW())",
            [Auth::parishId(), $memberId, $externalId, $provider, $phone, $amount, $purpose, $referenceId ?: null]
        );

        // Initiate payment via configured gateway (Selcom default)
        $result = Payment::initiateMno([
            'phone'       => $phone,
            'amount'      => $amount,
            'provider'    => $provider,
            'external_id' => $externalId,
            'name'        => $buyerName,
            'email'       => $buyerEmail,
            'currency'    => 'TZS',
        ]);

        // Save gateway reference
        Database::execute(
            "UPDATE payments SET gateway_ref=?, gateway_resp=? WHERE id=?",
            [$result['transaction_id'], json_encode($result), $paymentId]
        );

        Audit::log('payment.initiate', 'Payments', 'payments', $paymentId, [], ['amount' => $amount, 'provider' => $provider]);

        if ($result['success']) {
            Session::flash('info', 'Ombi la malipo limetumwa kwa simu yako. Thibitisha kwa PIN yako ya ' . strtoupper($provider) . '.');
        } else {
            Session::flash('error', 'Ombi la malipo halikufanikiwa: ' . $result['message']);
        }

        $this->redirect('/pay/status/' . $externalId);
    }

    // ── Payment status polling page ───────────────────────────

    public function status(string $externalId): void
    {
        $this->requireAuth();

        $payment = Database::selectOne(
            "SELECT * FROM payments WHERE external_id=? AND parish_id=?",
            [$externalId, Auth::parishId()]
        );

        if (!$payment) {
            Session::flash('error', 'Malipo hayajapatikana.');
            $this->redirect('/portal');
        }

        // Actively poll gateway when status is still pending
        if ($payment['status'] === 'pending' && !empty($payment['gateway_ref'])) {
            $gwStatus = Payment::queryStatus($payment['gateway_ref']);
            if ($gwStatus && $gwStatus['status'] !== 'pending') {
                Database::execute(
                    "UPDATE payments SET status=?, updated_at=NOW() WHERE id=?",
                    [$gwStatus['status'], $payment['id']]
                );
                $payment['status'] = $gwStatus['status'];

                // Auto-post income on confirmed completion
                if ($gwStatus['status'] === 'completed' && $payment['purpose'] === 'donation') {
                    $this->postDonationTransaction($payment);
                }
                if ($gwStatus['status'] === 'completed' && $payment['purpose'] === 'pledge' && $payment['reference_id']) {
                    Database::execute(
                        "UPDATE pledges SET amount_paid = amount_paid + ?, updated_at=NOW() WHERE id=?",
                        [$payment['amount'], $payment['reference_id']]
                    );
                }
            }
        }

        $this->view('Payments/views/status', compact('payment'));
    }

    // ── Azam Pay callback (webhook — no CSRF, external) ───────

    public function callback(): void
    {
        // No session / CSRF — this is called by Azam Pay's servers
        $raw = file_get_contents('php://input');
        $cb  = Payment::parseCallback($raw);

        if (!$cb) {
            http_response_code(400);
            echo json_encode(['message' => 'invalid payload']);
            exit;
        }

        $payment = Database::selectOne(
            "SELECT * FROM payments WHERE external_id=?",
            [$cb['external_id']]
        );

        if (!$payment) {
            http_response_code(404);
            echo json_encode(['message' => 'payment not found']);
            exit;
        }

        // Idempotent — skip already-completed
        if ($payment['status'] === 'completed') {
            http_response_code(200);
            echo json_encode(['message' => 'already processed']);
            exit;
        }

        Database::execute(
            "UPDATE payments SET status=?, gateway_ref=?, gateway_resp=?, updated_at=NOW() WHERE id=?",
            [$cb['status'], $cb['transaction_id'], json_encode($cb), $payment['id']]
        );

        // On success — auto-post income transaction for donations
        if ($cb['status'] === 'completed' && $payment['purpose'] === 'donation') {
            $this->postDonationTransaction($payment);
        }

        // On success — record pledge payment
        if ($cb['status'] === 'completed' && $payment['purpose'] === 'pledge' && $payment['reference_id']) {
            Database::execute(
                "UPDATE pledges SET amount_paid = amount_paid + ?, updated_at=NOW() WHERE id=?",
                [$payment['amount'], $payment['reference_id']]
            );
        }

        http_response_code(200);
        echo json_encode(['message' => 'ok']);
        exit;
    }

    // ── Payment receipt PDF ───────────────────────────────────

    public function receipt(string $externalId): void
    {
        $this->requireAuth();

        $payment = Database::selectOne(
            "SELECT p.*, m.first_name, m.last_name, m.member_number,
                    pa.name as parish_name, pa.diocese
             FROM payments p
             LEFT JOIN members m ON m.id = p.member_id
             JOIN parishes pa ON pa.id = p.parish_id
             WHERE p.external_id = ? AND p.parish_id = ? AND p.status = 'completed'",
            [$externalId, Auth::parishId()]
        );

        if (!$payment) {
            Session::flash('error', 'Risiti haijapatikana au malipo hayajathibitishwa.');
            $this->redirect('/portal/receipts');
        }

        $providerLabels = [
            'mpesa'       => 'M-Pesa',
            'tigopesa'    => 'Tigo Pesa',
            'airtelmoney' => 'Airtel Money',
            'halopesa'    => 'HaloPesa',
        ];
        $purposeLabels = [
            'donation' => 'Mchango',
            'pledge'   => 'Ahadi',
            'fee'      => 'Ada',
        ];

        $html = PDF::renderTemplate('Payments/views/receipt_pdf', compact('payment', 'providerLabels', 'purposeLabels'));
        $css  = '@page { size: A5; margin: 1.5cm; } body { font-family: sans-serif; font-size: 12px; }';

        $filename = 'risiti_' . $payment['external_id'];
        PDF::make(['format' => 'A5'])->html($html, $css)->download($filename);
    }

    // ── Payment history ───────────────────────────────────────

    public function history(): void
    {
        $this->requirePermission('payments_view');

        $pid    = Auth::parishId();
        $status = Request::get('status', '');
        $page   = max(1, (int) Request::get('page', 1));
        $perPage = 25;
        $offset = ($page - 1) * $perPage;

        $where  = ['p.parish_id = ?'];
        $params = [$pid];
        if ($status) {
            $where[]  = 'p.status = ?';
            $params[] = $status;
        }
        $whereStr = implode(' AND ', $where);

        $total = Database::selectOne("SELECT COUNT(*) as cnt FROM payments p WHERE {$whereStr}", $params)['cnt'];
        $rows  = Database::select(
            "SELECT p.*, m.first_name, m.last_name
             FROM payments p LEFT JOIN members m ON m.id=p.member_id
             WHERE {$whereStr} ORDER BY p.created_at DESC LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        $summary = Database::selectOne(
            "SELECT SUM(CASE WHEN status='completed' THEN amount ELSE 0 END) as total_completed,
                    COUNT(CASE WHEN status='completed' THEN 1 END) as cnt_completed,
                    COUNT(CASE WHEN status='pending' THEN 1 END) as cnt_pending
             FROM payments WHERE parish_id=?",
            [$pid]
        );

        $this->view('Payments/views/history', compact('rows', 'total', 'page', 'perPage', 'status', 'summary'));
    }

    // ── Private helpers ───────────────────────────────────────

    private function postDonationTransaction(array $payment): void
    {
        // Find or create "Online Donations" category
        $cat = Database::selectOne(
            "SELECT id FROM categories WHERE parish_id=? AND name='Michango ya Mtandaoni' LIMIT 1",
            [$payment['parish_id']]
        );
        $catId = $cat ? $cat['id'] : null;

        Database::insert(
            "INSERT INTO transactions
                (parish_id, type, amount, description, transaction_date, status, payment_method, category_id, created_at)
             VALUES (?, 'income', ?, ?, NOW(), 'approved', ?, ?, NOW())",
            [
                $payment['parish_id'],
                $payment['amount'],
                'Mchango wa mtandaoni — ' . strtoupper($payment['provider']),
                strtoupper($payment['provider']),
                $catId,
            ]
        );
    }
}
