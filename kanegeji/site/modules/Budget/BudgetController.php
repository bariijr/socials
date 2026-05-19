<?php

namespace App\Modules\Budget;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;

class BudgetController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
        $this->requirePermission('budget_view');
    }

    public function index(): void
    {
        $pid  = Auth::parishId();
        $year = (int) ($_GET['year'] ?? date('Y'));

        $budgets = Database::select(
            "SELECT b.*, tc.name as category_name,
                    COALESCE((
                        SELECT SUM(t.amount) FROM transactions t
                        WHERE t.parish_id = b.parish_id
                          AND t.category_id = b.category_id
                          AND YEAR(t.transaction_date) = b.fiscal_year
                          AND t.status = 'approved' AND t.deleted_at IS NULL
                    ), 0) as actual_spent
             FROM budgets b
             LEFT JOIN transaction_categories tc ON tc.id = b.category_id
             WHERE b.parish_id = ? AND b.fiscal_year = ?
             ORDER BY tc.name ASC, b.name ASC",
            [$pid, $year]
        );

        $totals = Database::selectOne(
            "SELECT COALESCE(SUM(amount_budgeted), 0) as total_budgeted FROM budgets WHERE parish_id=? AND fiscal_year=?",
            [$pid, $year]
        );

        $actualTotal = Database::selectOne(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions
             WHERE parish_id=? AND type='expense' AND status='approved' AND YEAR(transaction_date)=? AND deleted_at IS NULL",
            [$pid, $year]
        );

        $categories = Database::select(
            "SELECT id, name FROM transaction_categories WHERE parish_id=? AND type='expense' ORDER BY name",
            [$pid]
        );

        $years = range(date('Y'), date('Y') - 3);

        $this->view('Budget/views/index', compact('budgets', 'totals', 'actualTotal', 'categories', 'year', 'years'));
    }

    public function create(): void
    {
        $this->requirePermission('budget_manage');
        $pid        = Auth::parishId();
        $categories = Database::select(
            "SELECT id, name FROM transaction_categories WHERE parish_id=? AND type='expense' ORDER BY name",
            [$pid]
        );
        $this->view('Budget/views/create', compact('categories'));
    }

    public function store(): void
    {
        $this->requirePermission('budget_manage');
        $this->verifyCsrf();

        $pid = Auth::parishId();
        $id  = Database::insert(
            "INSERT INTO budgets (parish_id, fiscal_year, name, category_id, period, amount_budgeted, notes, created_by, created_at)
             VALUES (?,?,?,?,?,?,?,?,NOW())",
            [
                $pid,
                (int) ($_POST['fiscal_year'] ?? date('Y')),
                trim($_POST['name']),
                !empty($_POST['category_id']) ? (int) $_POST['category_id'] : null,
                $_POST['period'] ?? 'annual',
                (float) $_POST['amount_budgeted'],
                trim($_POST['notes'] ?? '') ?: null,
                Auth::id(),
            ]
        );

        Audit::log('create', 'Budget', 'budget', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Bajeti imehifadhiwa.'];
        redirect('/budget');
    }

    public function destroy(int $id): void
    {
        $this->requirePermission('budget_manage');
        $this->verifyCsrf();
        $b = Database::selectOne("SELECT id FROM budgets WHERE id=? AND parish_id=?", [$id, Auth::parishId()]);
        if (!$b) redirect('/budget');
        Database::execute("DELETE FROM budgets WHERE id=?", [$id]);
        Audit::log('delete', 'Budget', 'budget', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Bajeti imefutwa.'];
        redirect('/budget');
    }
}
