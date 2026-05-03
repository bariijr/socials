<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;

class DisbursementController extends Controller {
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->db = Database::getInstance();
    }

    public function index() {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $page = (int) $this->request->getQuery('page', 1);

        $disbursements = $this->db->fetchAll(
            "SELECT d.*, l.loanNumber, u.firstName, u.lastName, u.email
             FROM disbursements d
             JOIN loans l ON d.loanId = l.id
             JOIN users u ON l.borrowerId = u.id
             ORDER BY d.createdAt DESC LIMIT 20 OFFSET ?",
            [($page - 1) * 20]
        );

        $total = (int) $this->db->fetch("SELECT COUNT(*) as count FROM disbursements")['count'];

        return $this->json(['disbursements' => $disbursements, 'page' => $page, 'total' => $total]);
    }

    public function store() {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $data = $this->request->getBody();
        if (empty($data['loanId'])) return $this->error('loanId is required', 422);

        $loan = $this->db->fetch("SELECT * FROM loans WHERE id = ?", [$data['loanId']]);
        if (!$loan) return $this->error('Loan not found', 404);

        if ($loan['status'] !== 'approved') {
            return $this->error('Only approved loans can be disbursed', 400);
        }

        $existing = $this->db->fetch("SELECT id FROM disbursements WHERE loanId = ?", [$data['loanId']]);
        if ($existing) return $this->error('Loan already has a disbursement record', 400);

        $disbursementId = $this->db->insert(
            "INSERT INTO disbursements (loanId, amount, paymentMethod, transactionReference, disbursedById, disbursementDate, proofFileName, proofFilePath, proofMimeType)
             VALUES (?, ?, ?, ?, ?, CURDATE(), 'manual', 'manual', 'text/plain')",
            [$data['loanId'], $loan['disbursedAmount'], $data['method'] ?? 'bank_transfer',
             $data['reference'] ?? null, $this->getUser()['id']]
        );

        $this->db->update(
            "UPDATE loans SET status = 'disbursed', disbursedAt = NOW() WHERE id = ?",
            [$data['loanId']]
        );

        return $this->json(['id' => $disbursementId], 201);
    }

    public function show($id) {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $disbursement = $this->db->fetch(
            "SELECT d.*, l.loanNumber, u.firstName, u.lastName FROM disbursements d
             JOIN loans l ON d.loanId = l.id JOIN users u ON l.borrowerId = u.id WHERE d.id = ?",
            [$id]
        );

        if (!$disbursement) return $this->error('Disbursement not found', 404);

        return $this->json($disbursement);
    }
}
