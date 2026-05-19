<?php

namespace App\Modules\Reconciliation;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;

class ReconciliationController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
        $this->requirePermission('accounting.view');
    }

    public function index(): void
    {
        $pid   = Auth::parishId();
        $month = $_GET['month'] ?? date('Y-m');

        $items = Database::select(
            "SELECT r.*, t.reference_number, t.description as tx_desc, t.amount as tx_amount
             FROM reconciliation_items r
             LEFT JOIN transactions t ON t.id = r.transaction_id
             WHERE r.parish_id = ? AND DATE_FORMAT(r.statement_date, '%Y-%m') = ?
             ORDER BY r.statement_date ASC, r.id ASC",
            [$pid, $month]
        );

        $summary = Database::selectOne(
            "SELECT
               COUNT(*) as total,
               SUM(CASE WHEN status='unmatched' THEN 1 ELSE 0 END) as unmatched,
               SUM(CASE WHEN status='matched'   THEN 1 ELSE 0 END) as matched,
               SUM(CASE WHEN status='reconciled' THEN 1 ELSE 0 END) as reconciled,
               SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) as total_credits,
               SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END) as total_debits
             FROM reconciliation_items WHERE parish_id = ? AND DATE_FORMAT(statement_date,'%Y-%m')=?",
            [$pid, $month]
        );

        $this->view('Reconciliation/views/index', compact('items', 'summary', 'month'));
    }

    public function import(): void
    {
        $this->requirePermission('accounting.create');
        $this->verifyCsrf();

        $pid   = Auth::parishId();
        $lines = array_filter(array_map('trim', explode("\n", $_POST['statement_text'] ?? '')));
        $count = 0;

        foreach ($lines as $line) {
            // Expected CSV format: date,description,credit,debit
            $parts = str_getcsv($line);
            if (count($parts) < 3) continue;

            [$date, $desc] = [$parts[0], $parts[1]];
            $credit = (float) ($parts[2] ?? 0);
            $debit  = (float) ($parts[3] ?? 0);

            if ($credit > 0) {
                Database::execute(
                    "INSERT INTO reconciliation_items (parish_id, statement_date, description, amount, type, created_at)
                     VALUES (?,?,?,?,'credit',NOW())",
                    [$pid, $date, $desc, $credit]
                );
                $count++;
            }
            if ($debit > 0) {
                Database::execute(
                    "INSERT INTO reconciliation_items (parish_id, statement_date, description, amount, type, created_at)
                     VALUES (?,?,?,?,'debit',NOW())",
                    [$pid, $date, $desc, $debit]
                );
                $count++;
            }
        }

        Audit::log('import', 'Reconciliation', 'reconciliation_items', 0, [], ['count' => $count]);
        $_SESSION['flash'] = ['type' => 'success', 'message' => "Mistari {$count} imeingizwa."];
        redirect('/reconciliation');
    }

    public function match(): void
    {
        $this->requirePermission('accounting.create');
        $this->verifyCsrf();

        $itemId = (int) ($_POST['item_id'] ?? 0);
        $txId   = (int) ($_POST['transaction_id'] ?? 0);
        $pid    = Auth::parishId();

        $item = Database::selectOne("SELECT * FROM reconciliation_items WHERE id=? AND parish_id=?", [$itemId, $pid]);
        if (!$item) redirect('/reconciliation');

        if ($txId) {
            Database::execute(
                "UPDATE reconciliation_items SET transaction_id=?, status='matched' WHERE id=?",
                [$txId, $itemId]
            );
        } else {
            Database::execute(
                "UPDATE reconciliation_items SET transaction_id=NULL, status='unmatched' WHERE id=?",
                [$itemId]
            );
        }

        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Ioanishwa.'];
        redirect('/reconciliation?month=' . date('Y-m', strtotime($item['statement_date'])));
    }

    public function reconcile(): void
    {
        $this->requirePermission('accounting.approve');
        $this->verifyCsrf();

        $month = $_POST['month'] ?? date('Y-m');
        $pid   = Auth::parishId();

        Database::execute(
            "UPDATE reconciliation_items SET status='reconciled', reconciled_by=?, reconciled_at=NOW()
             WHERE parish_id=? AND status='matched' AND DATE_FORMAT(statement_date,'%Y-%m')=?",
            [Auth::id(), $pid, $month]
        );

        Audit::log('reconcile', 'Reconciliation', 'reconciliation_items', 0);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Miamala iliyofanana imewekwa kama imeoanishwa.'];
        redirect('/reconciliation?month=' . $month);
    }

    public function deleteItem(): void
    {
        $this->requirePermission('accounting.delete');
        $this->verifyCsrf();

        $id  = (int) ($_POST['item_id'] ?? 0);
        $pid = Auth::parishId();
        Database::execute("DELETE FROM reconciliation_items WHERE id=? AND parish_id=?", [$id, $pid]);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Kifungu kimefutwa.'];
        redirect('/reconciliation');
    }
}
