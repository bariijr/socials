<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;
use App\Services\LoanService;

class LoanController extends Controller {
    private $loanService;
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->loanService = new LoanService();
        $this->db = Database::getInstance();
    }

    public function index() {
        $this->requireAuth();

        $page = (int) $this->request->getQuery('page', 1);
        $status = $this->request->getQuery('status');
        $search = $this->request->getQuery('search');

        $sql = "SELECT l.*, u.firstName, u.lastName, p.name as packageName FROM loans l
                JOIN users u ON l.borrowerId = u.id
                JOIN loan_packages p ON l.packageId = p.id WHERE 1=1";
        $params = [];

        if ($this->getUser()['role'] === 'user') {
            $sql .= " AND l.borrowerId = ?";
            $params[] = $this->getUser()['id'];
        }

        if ($status) {
            $sql .= " AND l.status = ?";
            $params[] = $status;
        }

        if ($search) {
            $sql .= " AND l.loanNumber LIKE ?";
            $params[] = "%$search%";
        }

        $sql .= " ORDER BY l.createdAt DESC LIMIT 20 OFFSET " . (($page - 1) * 20);

        $loans = $this->db->fetchAll($sql, $params);
        $total = $this->db->fetch("SELECT COUNT(*) as count FROM loans WHERE 1=1" .
            ($this->getUser()['role'] === 'user' ? " AND borrowerId = ?" : ""),
            $this->getUser()['role'] === 'user' ? [$this->getUser()['id']] : []
        )['count'];

        return $this->json([
            'loans' => $loans,
            'page' => $page,
            'total' => $total,
            'pages' => ceil($total / 20)
        ]);
    }

    public function store() {
        $this->requireAuth();

        $data = $this->request->getBody();
        $id = $this->loanService->createLoan($data, $this->getUser()['id']);

        if (!$id) {
            return $this->error('Failed to create loan', 400);
        }

        return $this->json(['id' => $id, 'message' => 'Loan created'], 201);
    }

    public function show($id) {
        $this->requireAuth();

        $loan = $this->db->fetch(
            "SELECT l.*, u.firstName, u.lastName FROM loans l JOIN users u ON l.borrowerId = u.id WHERE l.id = ?",
            [$id]
        );

        if (!$loan) return $this->error('Loan not found', 404);

        if ($this->getUser()['role'] === 'user' && $loan['borrowerId'] !== $this->getUser()['id']) {
            return $this->error('Forbidden', 403);
        }

        // Get repayments & penalties
        $loan['repayments'] = $this->db->fetchAll("SELECT * FROM repayments WHERE loanId = ? ORDER BY createdAt DESC", [$id]);
        $loan['penalties'] = $this->db->fetchAll("SELECT * FROM penalties WHERE loanId = ? ORDER BY createdAt DESC", [$id]);

        return $this->json($loan);
    }

    public function update($id) {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $data = $this->request->getBody();
        $this->db->update("UPDATE loans SET purpose = ?, notes = ? WHERE id = ?",
            [$data['purpose'] ?? null, $data['notes'] ?? null, $id]);

        return $this->json(['message' => 'Loan updated']);
    }

    public function submit($id) {
        $this->requireAuth();

        $loan = $this->db->fetch("SELECT * FROM loans WHERE id = ?", [$id]);
        if (!$loan) return $this->error('Loan not found', 404);

        if ($loan['status'] !== 'draft') {
            return $this->error('Only draft loans can be submitted', 400);
        }

        $this->db->update("UPDATE loans SET status = 'submitted', submittedAt = NOW() WHERE id = ?", [$id]);

        return $this->json(['message' => 'Loan submitted']);
    }

    public function approve($id) {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $loan = $this->db->fetch("SELECT * FROM loans WHERE id = ?", [$id]);
        if (!$loan) return $this->error('Loan not found', 404);

        if ($loan['createdById'] === $this->getUser()['id']) {
            return $this->error('Approver cannot be the creator', 400);
        }

        if ($loan['status'] !== 'submitted') {
            return $this->error('Only submitted loans can be approved', 400);
        }

        $dueDate = date('Y-m-d', strtotime('+' . $loan['durationDays'] . ' days'));

        $this->db->update(
            "UPDATE loans SET status = 'approved', approvedById = ?, approvedAt = NOW(), dueDate = ?, isLocked = 1 WHERE id = ?",
            [$this->getUser()['id'], $dueDate, $id]
        );

        return $this->json(['message' => 'Loan approved']);
    }

    public function reject($id) {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $reason = $this->request->getBody('reason');
        $this->db->update("UPDATE loans SET status = 'rejected', rejectionReason = ? WHERE id = ?", [$reason, $id]);

        return $this->json(['message' => 'Loan rejected']);
    }

    public function disburse($id) {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $loan = $this->db->fetch("SELECT * FROM loans WHERE id = ?", [$id]);
        if (!$loan) return $this->error('Loan not found', 404);

        if ($loan['status'] !== 'approved') {
            return $this->error('Only approved loans can be disbursed', 400);
        }

        $this->db->update(
            "UPDATE loans SET status = 'disbursed', disbursedAt = NOW() WHERE id = ?",
            [$id]
        );

        return $this->json(['message' => 'Loan disbursed']);
    }

    public function getPackages() {
        $packages = $this->db->fetchAll("SELECT * FROM loan_packages WHERE isActive = 1 ORDER BY name ASC");
        return $this->json($packages);
    }

    public function storePackage() {
        $this->requireAuth();
        $this->requireRole('super_admin');

        $data = $this->request->getBody();
        $id = $this->db->insert(
            "INSERT INTO loan_packages (name, description, interestRate, interestFrequency, minAmount, maxAmount, minDuration, maxDuration, processingFeePercent, penaltyPercent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [$data['name'], $data['description'], $data['interestRate'], $data['interestFrequency'],
             $data['minAmount'], $data['maxAmount'], $data['minDuration'], $data['maxDuration'],
             $data['processingFeePercent'], $data['penaltyPercent']]
        );

        return $this->json(['id' => $id], 201);
    }

    public function acquireLock($id) {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin', 'loan_officer');

        $this->db->update(
            "UPDATE loans SET isLocked = 1, lockedById = ?, lockedAt = NOW(), lockedUntil = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ? AND isLocked = 0",
            [$this->getUser()['id'], $id]
        );

        return $this->json(['message' => 'Lock acquired']);
    }

    public function releaseLock($id) {
        $this->requireAuth();

        $this->db->update(
            "UPDATE loans SET isLocked = 0, lockedById = NULL, lockedAt = NULL, lockedUntil = NULL WHERE id = ? AND lockedById = ?",
            [$id, $this->getUser()['id']]
        );

        return $this->json(['message' => 'Lock released']);
    }

    public function updatePackage($id) {
        $this->requireAuth();
        $this->requireRole('super_admin');

        $data = $this->request->getBody();
        $this->db->update("UPDATE loan_packages SET name = ?, interestRate = ?, minAmount = ?, maxAmount = ? WHERE id = ?",
            [$data['name'], $data['interestRate'], $data['minAmount'], $data['maxAmount'], $id]);

        return $this->json(['message' => 'Package updated']);
    }
}
