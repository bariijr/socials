<?php

namespace App\Modules\Accounting;

use App\Core\{Auth, Database, Model};

class TransactionModel extends Model
{
    protected string $table = 'transactions';

    public function search(int $page, int $perPage, array $filters = []): array
    {
        $conditions = ['t.parish_id = ?', 't.deleted_at IS NULL'];
        $params     = [$this->parishId];

        if (!empty($filters['type'])) {
            $conditions[] = 't.type = ?';
            $params[]     = $filters['type'];
        }
        if (!empty($filters['status'])) {
            $conditions[] = 't.status = ?';
            $params[]     = $filters['status'];
        }
        if (!empty($filters['category_id'])) {
            $conditions[] = 't.category_id = ?';
            $params[]     = (int) $filters['category_id'];
        }
        if (!empty($filters['community_id'])) {
            $conditions[] = 't.community_id = ?';
            $params[]     = (int) $filters['community_id'];
        }
        if (!empty($filters['date_from'])) {
            $conditions[] = 't.transaction_date >= ?';
            $params[]     = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $conditions[] = 't.transaction_date <= ?';
            $params[]     = $filters['date_to'];
        }

        $where  = implode(' AND ', $conditions);
        $offset = ($page - 1) * $perPage;

        $total = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM transactions t WHERE {$where}",
            $params
        )['cnt'] ?? 0;

        $rows = Database::select(
            "SELECT t.*, tc.name as category_name, pm.name as payment_method_name,
                    m.first_name, m.last_name, co.name as community_name,
                    u.name as recorded_by_name
             FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
             LEFT JOIN members m ON m.id = t.member_id
             LEFT JOIN communities co ON co.id = t.community_id
             LEFT JOIN users u ON u.id = t.recorded_by
             WHERE {$where}
             ORDER BY t.transaction_date DESC, t.id DESC
             LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return [
            'data'         => $rows,
            'total'        => (int) $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int) ceil($total / $perPage),
            'from'         => (int) $total > 0 ? $offset + 1 : 0,
            'to'           => min($offset + $perPage, (int) $total),
        ];
    }

    public function getWithDetails(int $id): array|false
    {
        return Database::selectOne(
            "SELECT t.*, tc.name as category_name, pm.name as payment_method_name,
                    m.first_name, m.last_name, co.name as community_name,
                    u.name as recorded_by_name, a.name as approved_by_name
             FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
             LEFT JOIN members m ON m.id = t.member_id
             LEFT JOIN communities co ON co.id = t.community_id
             LEFT JOIN users u ON u.id = t.recorded_by
             LEFT JOIN users a ON a.id = t.approved_by
             WHERE t.id = ? AND t.parish_id = ? AND t.deleted_at IS NULL",
            [$id, $this->parishId]
        );
    }

    public function generateReferenceNo(): string
    {
        $prefix = 'TXN-' . date('Ymd') . '-';
        $last   = Database::selectOne(
            "SELECT reference_no FROM transactions WHERE reference_no LIKE ? ORDER BY id DESC LIMIT 1",
            [$prefix . '%']
        );
        $seq = $last ? (int) explode('-', $last['reference_no'])[3] + 1 : 1;
        return $prefix . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
    }

    public function getSummaryByPeriod(string $dateFrom, string $dateTo): array
    {
        $rows = Database::select(
            "SELECT type, SUM(amount) as total
             FROM transactions
             WHERE parish_id = ? AND status = 'approved' AND deleted_at IS NULL
             AND transaction_date BETWEEN ? AND ?
             GROUP BY type",
            [$this->parishId, $dateFrom, $dateTo]
        );

        $summary = ['income' => 0, 'expense' => 0, 'transfer' => 0];
        foreach ($rows as $row) {
            $summary[$row['type']] = (float) $row['total'];
        }
        $summary['net'] = $summary['income'] - $summary['expense'];
        return $summary;
    }

    public function getReceipt(int $transactionId): array|false
    {
        return Database::selectOne(
            "SELECT * FROM receipts WHERE transaction_id = ? LIMIT 1",
            [$transactionId]
        );
    }

    public function createReceipt(int $transactionId, string $issuedTo, float $amount): string
    {
        $receiptNo = 'RCP-' . date('Y') . '-' . str_pad((string) (Database::selectOne("SELECT COUNT(*)+1 as n FROM receipts WHERE parish_id = ?", [$this->parishId])['n'] ?? 1), 6, '0', STR_PAD_LEFT);
        $qrCode    = generateCode('RCP', 12);

        Database::execute(
            "INSERT INTO receipts (parish_id, transaction_id, receipt_no, qr_code, issued_to, amount, issued_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            [$this->parishId, $transactionId, $receiptNo, $qrCode, $issuedTo, $amount, Auth::id()]
        );

        return $receiptNo;
    }
}
