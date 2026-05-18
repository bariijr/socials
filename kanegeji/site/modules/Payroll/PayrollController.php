<?php

namespace App\Modules\Payroll;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;
use App\Core\PDF;

class PayrollController extends Controller
{
    private EmployeeModel $employee;
    private PayrollService $service;

    public function __construct()
    {
        $this->requireAuth();
        $this->employee = new EmployeeModel();
        $this->service  = new PayrollService();
    }

    // ── Employees ──────────────────────────────────────

    public function employees(): void
    {
        $this->requirePermission('payroll_view');
        $filters = $_GET;
        $page    = max(1, (int) ($_GET['page'] ?? 1));
        $data    = $this->employee->search($filters, $page);
        $this->view('Payroll/views/employees/index', $data);
    }

    public function createEmployee(): void
    {
        $this->requirePermission('payroll_manage');
        $this->view('Payroll/views/employees/create', []);
    }

    public function storeEmployee(): void
    {
        $this->requirePermission('payroll_manage');
        $this->verifyCsrf();

        $number = $this->employee->generateEmployeeNumber();
        $id = $this->employee->create([
            'parish_id'       => Auth::parishId(),
            'employee_number' => $number,
            'first_name'      => $_POST['first_name'],
            'last_name'       => $_POST['last_name'],
            'gender'          => $_POST['gender'],
            'dob'             => $_POST['dob'] ?: null,
            'phone'           => $_POST['phone'] ?? null,
            'email'           => $_POST['email'] ?? null,
            'position'        => $_POST['position'],
            'department'      => $_POST['department'] ?? null,
            'employment_type' => $_POST['employment_type'] ?? 'full_time',
            'employment_start'=> $_POST['employment_start'],
            'bank_name'       => $_POST['bank_name'] ?? null,
            'bank_account'    => $_POST['bank_account'] ?? null,
            'nssf_number'     => $_POST['nssf_number'] ?? null,
            'tin_number'      => $_POST['tin_number'] ?? null,
            'status'          => 'active',
            'notes'           => $_POST['notes'] ?? null,
        ]);

        // Save salary structure
        if (!empty($_POST['basic_salary'])) {
            Database::execute(
                "INSERT INTO salary_structures (parish_id, employee_id, basic_salary, housing_allowance, transport_allowance, other_allowances, nssf_employee, nssf_employer, paye, other_deductions, effective_from, is_active, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,1,NOW(),NOW())",
                [
                    Auth::parishId(), $id,
                    $_POST['basic_salary'] ?? 0,
                    $_POST['housing_allowance'] ?? 0,
                    $_POST['transport_allowance'] ?? 0,
                    $_POST['other_allowances'] ?? 0,
                    $_POST['nssf_employee'] ?? 0,
                    $_POST['nssf_employer'] ?? 0,
                    $_POST['paye'] ?? 0,
                    $_POST['other_deductions'] ?? 0,
                    $_POST['effective_from'] ?? date('Y-m-01'),
                ]
            );
        }

        Audit::log('create', 'Payroll', 'employee', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => "Mfanyakazi {$number} amesajiliwa."];
        redirect('/payroll/employees/' . $id);
    }

    public function showEmployee(int $id): void
    {
        $this->requirePermission('payroll_view');
        $emp    = $this->employee->findOrFail($id, Auth::parishId());
        $salary = $this->employee->getActiveSalary($id);
        $runs   = Database::select(
            "SELECT pr.*, pri.gross_pay, pri.net_pay, pri.payment_status as item_status
             FROM payroll_run_items pri
             JOIN payroll_runs pr ON pr.id = pri.payroll_run_id
             WHERE pri.employee_id = ? ORDER BY pr.period_year DESC, pr.period_month DESC LIMIT 12",
            [$id]
        );
        $this->view('Payroll/views/employees/show', compact('emp', 'salary', 'runs'));
    }

    public function editEmployee(int $id): void
    {
        $this->requirePermission('payroll_manage');
        $emp    = $this->employee->findOrFail($id, Auth::parishId());
        $salary = $this->employee->getActiveSalary($id);
        $this->view('Payroll/views/employees/edit', compact('emp', 'salary'));
    }

    public function updateEmployee(int $id): void
    {
        $this->requirePermission('payroll_manage');
        $this->verifyCsrf();
        $emp = $this->employee->findOrFail($id, Auth::parishId());

        $this->employee->update($id, [
            'first_name'      => $_POST['first_name'],
            'last_name'       => $_POST['last_name'],
            'gender'          => $_POST['gender'],
            'dob'             => $_POST['dob'] ?: null,
            'phone'           => $_POST['phone'] ?? null,
            'email'           => $_POST['email'] ?? null,
            'position'        => $_POST['position'],
            'department'      => $_POST['department'] ?? null,
            'employment_type' => $_POST['employment_type'] ?? 'full_time',
            'employment_start'=> $_POST['employment_start'],
            'employment_end'  => $_POST['employment_end'] ?: null,
            'bank_name'       => $_POST['bank_name'] ?? null,
            'bank_account'    => $_POST['bank_account'] ?? null,
            'nssf_number'     => $_POST['nssf_number'] ?? null,
            'tin_number'      => $_POST['tin_number'] ?? null,
            'status'          => $_POST['status'] ?? 'active',
            'notes'           => $_POST['notes'] ?? null,
        ]);

        if (!empty($_POST['basic_salary'])) {
            Database::execute("UPDATE salary_structures SET is_active = 0 WHERE employee_id = ?", [$id]);
            Database::execute(
                "INSERT INTO salary_structures (parish_id, employee_id, basic_salary, housing_allowance, transport_allowance, other_allowances, nssf_employee, nssf_employer, paye, other_deductions, effective_from, is_active, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,1,NOW(),NOW())",
                [
                    Auth::parishId(), $id,
                    $_POST['basic_salary'] ?? 0,
                    $_POST['housing_allowance'] ?? 0,
                    $_POST['transport_allowance'] ?? 0,
                    $_POST['other_allowances'] ?? 0,
                    $_POST['nssf_employee'] ?? 0,
                    $_POST['nssf_employer'] ?? 0,
                    $_POST['paye'] ?? 0,
                    $_POST['other_deductions'] ?? 0,
                    date('Y-m-01'),
                ]
            );
        }

        Audit::log('update', 'Payroll', 'employee', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Taarifa za mfanyakazi zimesasishwa.'];
        redirect('/payroll/employees/' . $id);
    }

    // ── Payroll Runs ──────────────────────────────────

    public function runs(): void
    {
        $this->requirePermission('payroll_view');
        $runs = Database::select(
            "SELECT pr.*, u.first_name, u.last_name FROM payroll_runs pr LEFT JOIN users u ON u.id = pr.created_by WHERE pr.parish_id = ? ORDER BY pr.period_year DESC, pr.period_month DESC",
            [Auth::parishId()]
        );
        $this->view('Payroll/views/runs/index', compact('runs'));
    }

    public function createRun(): void
    {
        $this->requirePermission('payroll_manage');
        $this->view('Payroll/views/runs/create', [
            'months' => ['Januari','Februari','Machi','Aprili','Mei','Juni','Julai','Agosti','Septemba','Oktoba','Novemba','Desemba'],
        ]);
    }

    public function storeRun(): void
    {
        $this->requirePermission('payroll_manage');
        $this->verifyCsrf();

        $month  = (int) $_POST['month'];
        $year   = (int) $_POST['year'];
        $runId  = $this->service->createRun(Auth::parishId(), $month, $year, Auth::id());

        Audit::log('create', 'Payroll', 'payroll_run', $runId);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Malipo ya mwezi yametengenezwa.'];
        redirect('/payroll/runs/' . $runId);
    }

    public function showRun(int $id): void
    {
        $this->requirePermission('payroll_view');
        $run   = Database::selectOne("SELECT * FROM payroll_runs WHERE id = ? AND parish_id = ?", [$id, Auth::parishId()]);
        if (!$run) redirect('/payroll/runs');

        $items = Database::select(
            "SELECT pri.*, e.first_name, e.last_name, e.employee_number, e.position
             FROM payroll_run_items pri JOIN employees e ON e.id = pri.employee_id
             WHERE pri.payroll_run_id = ? ORDER BY e.first_name",
            [$id]
        );
        $this->view('Payroll/views/runs/show', compact('run', 'items'));
    }

    public function approveRun(int $id): void
    {
        $this->requirePermission('payroll_approve');
        $this->verifyCsrf();
        Database::execute(
            "UPDATE payroll_runs SET status = 'approved', approved_by = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ? AND parish_id = ?",
            [Auth::id(), $id, Auth::parishId()]
        );
        Audit::log('approve', 'Payroll', 'payroll_run', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Malipo yameidhinishwa.'];
        redirect('/payroll/runs/' . $id);
    }

    public function payslip(int $itemId): void
    {
        $this->requirePermission('payroll_view');
        $item = Database::selectOne(
            "SELECT pri.*, e.first_name, e.last_name, e.employee_number, e.position, e.department, e.bank_name, e.bank_account, pr.period_month, pr.period_year, pr.run_number
             FROM payroll_run_items pri
             JOIN employees e ON e.id = pri.employee_id
             JOIN payroll_runs pr ON pr.id = pri.payroll_run_id
             WHERE pri.id = ?",
            [$itemId]
        );
        if (!$item) redirect('/payroll/runs');

        $parishId = Auth::parishId();
        $parish   = Database::selectOne("SELECT * FROM parishes WHERE id = ?", [$parishId]);

        $html = PDF::renderTemplate('Payroll/views/payslip_pdf', compact('item', 'parish'));
        PDF::make(['format' => 'A5'])->html($html)->download('payslip_' . $item['employee_number'] . '_' . $item['period_year'] . $item['period_month']);
    }
}
