<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;

class ReceiptController extends Controller {
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->db = Database::getInstance();
    }

    public function index() {
        $this->requireAuth();

        $page = (int) $this->request->getQuery('page', 1);
        $status = $this->request->getQuery('status');
        $loanId = $this->request->getQuery('loanId');

        $sql = "SELECT r.*, u.email as submittedBy FROM receipts r JOIN users u ON r.submittedById = u.id WHERE 1=1";
        $params = [];

        if ($status) {
            $sql .= " AND r.status = ?";
            $params[] = $status;
        }

        if ($loanId) {
            $sql .= " AND r.loanId = ?";
            $params[] = $loanId;
        }

        $sql .= " ORDER BY r.createdAt DESC LIMIT 20 OFFSET " . (($page - 1) * 20);

        $receipts = $this->db->fetchAll($sql, $params);
        return $this->json($receipts);
    }

    public function store() {
        $this->requireAuth();

        $file = $this->request->getFile('receipt');
        if (!$file) return $this->error('No file uploaded', 400);

        $filePath = __DIR__ . '/../../public/uploads/receipts/' . uniqid() . '_' . basename($file['name']);
        if (!move_uploaded_file($file['tmp_name'], $filePath)) {
            return $this->error('File upload failed', 400);
        }

        $fileHash = hash_file('sha256', $filePath);

        // Check for duplicates
        $duplicate = $this->db->fetch("SELECT id FROM receipts WHERE fileHash = ?", [$fileHash]);
        if ($duplicate) {
            unlink($filePath);
            return $this->error('Duplicate receipt detected', 409);
        }

        $receiptId = $this->db->insert(
            "INSERT INTO receipts (receiptNumber, loanId, submittedById, amount, paymentDate, paymentMethod, fileHash, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')",
            [$this->request->getBody('receiptNumber'), $this->request->getBody('loanId'),
             $this->getUser()['id'], $this->request->getBody('amount'),
             $this->request->getBody('paymentDate'), $this->request->getBody('paymentMethod'), $fileHash]
        );

        $this->db->insert(
            "INSERT INTO receipt_files (receiptId, fileName, filePath, mimeType, fileSize, fileHash, isPrimary)
             VALUES (?, ?, ?, ?, ?, ?, 1)",
            [$receiptId, $file['name'], $filePath, $file['type'], $file['size'], $fileHash]
        );

        return $this->json(['id' => $receiptId], 201);
    }

    public function show($id) {
        $this->requireAuth();

        $receipt = $this->db->fetch("SELECT * FROM receipts WHERE id = ?", [$id]);
        if (!$receipt) return $this->error('Receipt not found', 404);

        $receipt['files'] = $this->db->fetchAll("SELECT * FROM receipt_files WHERE receiptId = ?", [$id]);

        return $this->json($receipt);
    }

    public function verify($id) {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $receipt = $this->db->fetch("SELECT * FROM receipts WHERE id = ?", [$id]);
        if (!$receipt) return $this->error('Receipt not found', 404);

        $this->db->update(
            "UPDATE receipts SET status = 'verified', verifiedById = ?, verifiedAt = NOW() WHERE id = ?",
            [$this->getUser()['id'], $id]
        );

        // If receipt is for a loan, update repayment
        if ($receipt['loanId']) {
            $this->db->insert(
                "INSERT INTO repayments (loanId, amount, status, paymentDate, paymentMethod) VALUES (?, ?, 'verified', ?, ?)",
                [$receipt['loanId'], $receipt['amount'], $receipt['paymentDate'], $receipt['paymentMethod']]
            );

            $loan = $this->db->fetch("SELECT outstandingBalance FROM loans WHERE id = ?", [$receipt['loanId']]);
            $newBalance = max(0, $loan['outstandingBalance'] - $receipt['amount']);
            $status = $newBalance <= 0 ? 'closed' : 'disbursed';

            $this->db->update(
                "UPDATE loans SET outstandingBalance = ?, totalRepaid = totalRepaid + ?, status = ? WHERE id = ?",
                [$newBalance, $receipt['amount'], $status, $receipt['loanId']]
            );
        }

        return $this->json(['message' => 'Receipt verified']);
    }

    public function reject($id) {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $reason = $this->request->getBody('reason');
        $this->db->update(
            "UPDATE receipts SET status = 'rejected', rejectionReason = ? WHERE id = ?",
            [$reason, $id]
        );

        return $this->json(['message' => 'Receipt rejected']);
    }
}
