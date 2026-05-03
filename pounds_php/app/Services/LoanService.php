<?php
namespace App\Services;

use App\Core\Database;

class LoanService {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function createLoan(array $data, string $userId): ?string {
        $package = $this->db->fetch(
            "SELECT * FROM loan_packages WHERE id = ? AND isActive = 1",
            [$data['packageId']]
        );

        if (!$package) return null;

        if ($data['principalAmount'] < $package['minAmount'] || $data['principalAmount'] > $package['maxAmount']) {
            return null;
        }

        $processingFee = ($data['principalAmount'] * $package['processingFeePercent']) / 100;
        $interestAmount = ($data['principalAmount'] * $package['interestRate'] * $data['durationDays']) / (30 * 100);
        $totalRepayable = $data['principalAmount'] + $interestAmount;

        $sql = "INSERT INTO loans (loanNumber, borrowerId, createdById, packageId, principalAmount, interestRate, durationDays, processingFeeAmount, disbursedAmount, totalRepayable, outstandingBalance, purpose, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')";

        return $this->db->insert($sql, [
            $this->generateLoanNumber(),
            $data['borrowerId'] ?? $userId,
            $userId,
            $data['packageId'],
            $data['principalAmount'],
            $package['interestRate'],
            $data['durationDays'],
            $processingFee,
            $data['principalAmount'] - $processingFee,
            $totalRepayable,
            $totalRepayable,
            $data['purpose'] ?? null
        ]);
    }

    public function approveLoan(string $loanId, string $userId): bool {
        $loan = $this->db->fetch("SELECT * FROM loans WHERE id = ?", [$loanId]);

        if (!$loan || $loan['createdById'] === $userId) return false;

        $dueDate = date('Y-m-d', strtotime('+' . $loan['durationDays'] . ' days'));

        return (bool) $this->db->update(
            "UPDATE loans SET status = 'approved', approvedById = ?, approvedAt = NOW(), dueDate = ?, isLocked = 1 WHERE id = ?",
            [$userId, $dueDate, $loanId]
        );
    }

    public function applyPenalties(): int {
        $overdueLoans = $this->db->fetchAll(
            "SELECT id, outstandingBalance, totalPenalties FROM loans WHERE status = 'disbursed' AND dueDate < NOW()"
        );

        $count = 0;
        foreach ($overdueLoans as $loan) {
            $penaltyAmount = ($loan['outstandingBalance'] * 5) / 100;

            $this->db->insert(
                "INSERT INTO penalties (loanId, amount, ratePercent, balanceAtTime) VALUES (?, ?, ?, ?)",
                [$loan['id'], $penaltyAmount, 5, $loan['outstandingBalance']]
            );

            $this->db->update(
                "UPDATE loans SET status = 'overdue', outstandingBalance = outstandingBalance + ?, totalPenalties = totalPenalties + ? WHERE id = ?",
                [$penaltyAmount, $penaltyAmount, $loan['id']]
            );

            $count++;
        }

        return $count;
    }

    private function generateLoanNumber(): string {
        $date = new \DateTime();
        $prefix = 'LN' . $date->format('Ym');
        $count = (int) $this->db->fetch("SELECT COUNT(*) as count FROM loans")['count'];
        return $prefix . str_pad($count + 1, 5, '0', STR_PAD_LEFT);
    }
}
