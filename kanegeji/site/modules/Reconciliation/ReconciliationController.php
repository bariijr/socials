<?php

namespace App\Modules\Reconciliation;

use App\Core\{Audit, Auth, Controller, Database, Request, Session};

class ReconciliationController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
        $this->requirePermission('reconciliation_view');
    }

    public function index(): void
    {
        $pid   = Auth::parishId();
        $month = Request::get('month', date('Y-m'));

        $items = Database::select(
            "SELECT r.*,
                    t.reference_no   AS tx_ref,
                    t.description    AS tx_desc,
                    t.amount         AS tx_amount,
                    t.transaction_date AS tx_date,
                    tc.name          AS tx_category,
                    u.name           AS tx_recorded_by
             FROM reconciliation_items r
             LEFT JOIN transactions t  ON t.id = r.transaction_id
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             LEFT JOIN users u ON u.id = t.recorded_by
             WHERE r.parish_id = ? AND DATE_FORMAT(r.statement_date, '%Y-%m') = ?
             ORDER BY r.statement_date ASC, r.id ASC",
            [$pid, $month]
        );

        $summary = Database::selectOne(
            "SELECT
               COUNT(*)                                                  AS total,
               SUM(CASE WHEN status='unmatched'  THEN 1 ELSE 0 END)     AS unmatched,
               SUM(CASE WHEN status='matched'    THEN 1 ELSE 0 END)     AS matched,
               SUM(CASE WHEN status='reconciled' THEN 1 ELSE 0 END)     AS reconciled,
               SUM(CASE WHEN type='credit' THEN amount ELSE 0 END)      AS total_credits,
               SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END)      AS total_debits
             FROM reconciliation_items
             WHERE parish_id = ? AND DATE_FORMAT(statement_date,'%Y-%m') = ?",
            [$pid, $month]
        );

        // System totals for the same period (approved transactions)
        [$y, $m] = explode('-', $month . '-01');
        $periodStart = "{$y}-{$m}-01";
        $periodEnd   = date('Y-m-t', strtotime($periodStart));

        $systemTotals = Database::selectOne(
            "SELECT
               SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS system_income,
               SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS system_expense
             FROM transactions
             WHERE parish_id = ? AND status='approved' AND deleted_at IS NULL
               AND transaction_date BETWEEN ? AND ?",
            [$pid, $periodStart, $periodEnd]
        );

        $this->view('Reconciliation/views/index', compact('items', 'summary', 'month', 'systemTotals'));
    }

    // ── IMPORT ─────────────────────────────────────────────────────────────────

    public function import(): void
    {
        $this->requirePermission('accounting.create');
        $this->verifyCsrf();

        $pid   = Auth::parishId();
        $count = 0;

        // Support both file upload and textarea paste
        if (!empty($_FILES['statement_file']['tmp_name'])) {
            $csv = file_get_contents($_FILES['statement_file']['tmp_name']);
        } else {
            $csv = $_POST['statement_text'] ?? '';
        }

        $lines = array_filter(array_map('trim', explode("\n", $csv)));

        foreach ($lines as $line) {
            // Skip obvious header lines
            if (preg_match('/^(date|tarehe|#)/i', $line)) continue;

            $parts = str_getcsv($line);
            if (count($parts) < 2) continue;

            $date   = trim($parts[0] ?? '');
            $desc   = trim($parts[1] ?? '');
            $credit = (float) preg_replace('/[^0-9.]/', '', $parts[2] ?? '0');
            $debit  = (float) preg_replace('/[^0-9.]/', '', $parts[3] ?? '0');

            // Validate date
            $dt = date_create_from_format('Y-m-d', $date)
               ?: date_create_from_format('d/m/Y', $date)
               ?: date_create_from_format('m/d/Y', $date);
            if (!$dt) continue;
            $date = $dt->format('Y-m-d');

            if ($credit > 0) {
                Database::execute(
                    "INSERT INTO reconciliation_items (parish_id, statement_date, description, amount, type)
                     VALUES (?,?,?,?,'credit')",
                    [$pid, $date, $desc, $credit]
                );
                $count++;
            }
            if ($debit > 0) {
                Database::execute(
                    "INSERT INTO reconciliation_items (parish_id, statement_date, description, amount, type)
                     VALUES (?,?,?,?,'debit')",
                    [$pid, $date, $desc, $debit]
                );
                $count++;
            }
        }

        Audit::log('import', 'Reconciliation', 'reconciliation_items', 0, [], ['count' => $count]);
        Session::flash('success', "Mistari {$count} imeingizwa.");
        $this->redirect('/reconciliation');
    }

    // ── MATCH / UNMATCH ────────────────────────────────────────────────────────

    public function match(): void
    {
        $this->requirePermission('accounting.create');
        $this->verifyCsrf();

        $itemId = (int) ($_POST['item_id'] ?? 0);
        $txId   = (int) ($_POST['transaction_id'] ?? 0);
        $pid    = Auth::parishId();

        $item = Database::selectOne(
            "SELECT * FROM reconciliation_items WHERE id = ? AND parish_id = ?",
            [$itemId, $pid]
        );
        if (!$item) {
            $this->redirect('/reconciliation');
        }

        if ($txId) {
            // Verify the transaction belongs to this parish
            $tx = Database::selectOne(
                "SELECT id FROM transactions WHERE id = ? AND parish_id = ? AND deleted_at IS NULL",
                [$txId, $pid]
            );
            if (!$tx) {
                Session::flash('error', 'Muamala haukupatikana.');
                $this->redirect('/reconciliation?month=' . date('Y-m', strtotime($item['statement_date'])));
            }

            Database::execute(
                "UPDATE reconciliation_items SET transaction_id = ?, status = 'matched' WHERE id = ?",
                [$txId, $itemId]
            );
            Audit::log('match', 'Reconciliation', 'reconciliation_items', $itemId);
            Session::flash('success', 'Ioanishwa.');
        } else {
            Database::execute(
                "UPDATE reconciliation_items SET transaction_id = NULL, status = 'unmatched' WHERE id = ?",
                [$itemId]
            );
            Audit::log('unmatch', 'Reconciliation', 'reconciliation_items', $itemId);
            Session::flash('success', 'Mwangano umeondolewa.');
        }

        $this->redirect('/reconciliation?month=' . date('Y-m', strtotime($item['statement_date'])));
    }

    // ── AUTO-MATCH ─────────────────────────────────────────────────────────────

    public function autoMatch(): void
    {
        $this->requirePermission('accounting.create');
        $this->verifyCsrf();

        $pid   = Auth::parishId();
        $month = $_POST['month'] ?? date('Y-m');

        $unmatched = Database::select(
            "SELECT id, amount, statement_date, type
             FROM reconciliation_items
             WHERE parish_id = ? AND status = 'unmatched' AND DATE_FORMAT(statement_date,'%Y-%m') = ?",
            [$pid, $month]
        );

        $matched = 0;
        foreach ($unmatched as $item) {
            $txTypes      = $item['type'] === 'credit' ? ['income'] : ['expense', 'transfer'];
            $placeholders = implode(',', array_fill(0, count($txTypes), '?'));

            $tx = Database::selectOne(
                "SELECT t.id FROM transactions t
                 WHERE t.parish_id = ?
                   AND t.deleted_at IS NULL
                   AND t.type IN ({$placeholders})
                   AND ABS(t.amount - ?) < 0.01
                   AND ABS(DATEDIFF(t.transaction_date, ?)) <= 3
                   AND t.id NOT IN (
                       SELECT ri.transaction_id FROM reconciliation_items ri
                       WHERE ri.transaction_id IS NOT NULL
                         AND ri.parish_id = ?
                         AND ri.status != 'unmatched'
                   )
                 ORDER BY ABS(DATEDIFF(t.transaction_date, ?)) ASC
                 LIMIT 1",
                array_merge([$pid], $txTypes, [$item['amount'], $item['statement_date'], $pid, $item['statement_date']])
            );

            if ($tx) {
                Database::execute(
                    "UPDATE reconciliation_items SET transaction_id = ?, status = 'matched' WHERE id = ?",
                    [$tx['id'], $item['id']]
                );
                $matched++;
            }
        }

        Audit::log('auto_match', 'Reconciliation', 'reconciliation_items', 0, [], ['matched' => $matched]);
        Session::flash('success', "Miamala {$matched} imeoanishwa kiotomatiki.");
        $this->redirect('/reconciliation?month=' . $month);
    }

    // ── RECONCILE ALL MATCHED ──────────────────────────────────────────────────

    public function reconcile(): void
    {
        $this->requirePermission('accounting.approve');
        $this->verifyCsrf();

        $month = $_POST['month'] ?? date('Y-m');
        $pid   = Auth::parishId();

        $count = Database::selectOne(
            "SELECT COUNT(*) AS cnt FROM reconciliation_items
             WHERE parish_id = ? AND status = 'matched' AND DATE_FORMAT(statement_date,'%Y-%m') = ?",
            [$pid, $month]
        )['cnt'] ?? 0;

        Database::execute(
            "UPDATE reconciliation_items
             SET status = 'reconciled', reconciled_by = ?, reconciled_at = NOW()
             WHERE parish_id = ? AND status = 'matched' AND DATE_FORMAT(statement_date,'%Y-%m') = ?",
            [Auth::id(), $pid, $month]
        );

        Audit::log('reconcile', 'Reconciliation', 'reconciliation_items', 0, [], ['month' => $month, 'count' => $count]);
        Session::flash('success', "Miamala {$count} iliyofanana imethibitishwa.");
        $this->redirect('/reconciliation?month=' . $month);
    }

    // ── DELETE ITEM ────────────────────────────────────────────────────────────

    public function deleteItem(): void
    {
        $this->requirePermission('accounting.delete');
        $this->verifyCsrf();

        $id  = (int) ($_POST['item_id'] ?? 0);
        $pid = Auth::parishId();

        Database::execute(
            "DELETE FROM reconciliation_items WHERE id = ? AND parish_id = ? AND status = 'unmatched'",
            [$id, $pid]
        );
        Session::flash('success', 'Kifungu kimefutwa.');
        $this->redirect('/reconciliation');
    }

    // ── SEARCH TRANSACTIONS (AJAX/JSON) ───────────────────────────────────────

    public function searchTransactions(): void
    {
        $this->requirePermission('reconciliation_view');

        $pid    = Auth::parishId();
        $amount = (float) Request::get('amount', 0);
        $type   = Request::get('type', 'credit');
        $q      = trim(Request::get('q', ''));

        // Sanitize date — accept YYYY-MM-DD only
        $rawDate = Request::get('date', date('Y-m-d'));
        $date    = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawDate) ? $rawDate : date('Y-m-d');

        $txTypes      = $type === 'credit' ? ['income'] : ['expense', 'transfer'];
        $placeholders = implode(',', array_fill(0, count($txTypes), '?'));
        $tolerance    = max($amount * 0.25, 5000);

        $params = array_merge([$pid], $txTypes);

        // If user typed a search query, search by description/ref; otherwise filter by amount+date
        if ($q !== '') {
            $amountClause = '';
            $dateClause   = '';
            $params[]     = '%' . $q . '%';
            $params[]     = '%' . $q . '%';
            $textClause   = "AND (t.description LIKE ? OR t.reference_no LIKE ?)";
            $orderClause  = "ORDER BY t.transaction_date DESC";
        } else {
            $params[]     = $amount - $tolerance;
            $params[]     = $amount + $tolerance;
            $params[]     = $date;
            $amountClause = "AND t.amount BETWEEN ? AND ?";
            $dateClause   = "AND ABS(DATEDIFF(t.transaction_date, ?)) <= 14";
            $textClause   = '';
            $orderClause  = "ORDER BY ABS(t.amount - {$amount}) ASC, ABS(DATEDIFF(t.transaction_date, '{$date}')) ASC";
        }

        $params[] = $pid;

        $rows = Database::select(
            "SELECT t.id, t.reference_no, t.description, t.amount, t.transaction_date, t.type, t.status,
                    tc.name AS category_name
             FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             WHERE t.parish_id = ?
               AND t.deleted_at IS NULL
               AND t.type IN ({$placeholders})
               {$amountClause}
               {$dateClause}
               {$textClause}
               AND t.id NOT IN (
                   SELECT ri.transaction_id FROM reconciliation_items ri
                   WHERE ri.transaction_id IS NOT NULL
                     AND ri.parish_id = ?
                     AND ri.status != 'unmatched'
               )
             {$orderClause}
             LIMIT 15",
            $params
        );

        $this->json($rows);
    }
}
