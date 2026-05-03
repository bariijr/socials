<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;

class RepaymentController extends Controller {
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->db = Database::getInstance();
    }

    public function index($loanId) {
        $this->requireAuth();

        $loan = $this->db->fetch("SELECT * FROM loans WHERE id = ?", [$loanId]);
        if (!$loan) return $this->error('Loan not found', 404);

        if ($this->getUser()['role'] === 'user' && $loan['borrowerId'] !== $this->getUser()['id']) {
            return $this->error('Forbidden', 403);
        }

        $repayments = $this->db->fetchAll(
            "SELECT r.*, u.firstName, u.lastName FROM repayments r
             LEFT JOIN users u ON r.receivedById = u.id
             WHERE r.loanId = ? ORDER BY r.createdAt DESC",
            [$loanId]
        );

        $summary = $this->db->fetch(
            "SELECT COALESCE(SUM(amount), 0) as totalPaid, COUNT(*) as count FROM repayments WHERE loanId = ? AND status = 'verified'",
            [$loanId]
        );

        return $this->json(['repayments' => $repayments, 'summary' => $summary]);
    }

    public function store() {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin', 'loan_officer');

        $data = $this->request->getBody();

        if (empty($data['loanId']) || empty($data['amount'])) {
            return $this->error('loanId and amount are required', 422);
        }

        $loan = $this->db->fetch("SELECT * FROM loans WHERE id = ?", [$data['loanId']]);
        if (!$loan) return $this->error('Loan not found', 404);

        if (!in_array($loan['status'], ['disbursed', 'overdue'])) {
            return $this->error('Loan is not active for repayment', 400);
        }

        $amount = (float) $data['amount'];
        if ($amount <= 0) return $this->error('Amount must be positive', 400);

        $repaymentId = $this->db->insert(
            "INSERT INTO repayments (loanId, amount, status, paymentDate, paymentMethod, notes, recordedById)
             VALUES (?, ?, 'verified', ?, ?, ?, ?)",
            [$data['loanId'], $amount, $data['paymentDate'] ?? date('Y-m-d'),
             $data['paymentMethod'] ?? 'cash', $data['notes'] ?? null, $this->getUser()['id']]
        );

        $newBalance = max(0, $loan['outstandingBalance'] - $amount);
        $newStatus = $newBalance <= 0 ? 'closed' : $loan['status'];

        $this->db->update(
            "UPDATE loans SET outstandingBalance = ?, totalRepaid = totalRepaid + ?, status = ? WHERE id = ?",
            [$newBalance, $amount, $newStatus, $data['loanId']]
        );

        return $this->json([
            'id' => $repaymentId,
            'outstandingBalance' => $newBalance,
            'status' => $newStatus
        ], 201);
    }
}
