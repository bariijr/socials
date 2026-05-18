<?php

namespace App\Modules\Payroll;

use App\Core\Database;
use App\Core\Auth;

class PayrollService
{
    public function generateRun(int $parishId, int $month, int $year, int $createdBy): array
    {
        $employees = Database::select(
            "SELECT e.*, ss.basic_salary, ss.housing_allowance, ss.transport_allowance,
                    ss.other_allowances, ss.nssf_employee, ss.nssf_employer, ss.paye, ss.other_deductions
             FROM employees e
             LEFT JOIN salary_structures ss ON ss.employee_id = e.id AND ss.is_active = 1
             WHERE e.parish_id = ? AND e.status = 'active' AND e.deleted_at IS NULL",
            [$parishId]
        );

        $items        = [];
        $totalGross   = 0;
        $totalDeduct  = 0;
        $totalNet     = 0;

        foreach ($employees as $emp) {
            $basic      = (float) ($emp['basic_salary'] ?? 0);
            $housing    = (float) ($emp['housing_allowance'] ?? 0);
            $transport  = (float) ($emp['transport_allowance'] ?? 0);
            $otherAllow = (float) ($emp['other_allowances'] ?? 0);
            $gross      = $basic + $housing + $transport + $otherAllow;

            $nssfEmp    = (float) ($emp['nssf_employee'] ?? 0);
            $nssfEmpr   = (float) ($emp['nssf_employer'] ?? 0);
            $paye       = (float) ($emp['paye'] ?? 0);
            $otherDed   = (float) ($emp['other_deductions'] ?? 0);
            $totalDed   = $nssfEmp + $paye + $otherDed;
            $net        = $gross - $totalDed;

            $totalGross  += $gross;
            $totalDeduct += $totalDed;
            $totalNet    += $net;

            $items[] = [
                'employee_id'        => $emp['id'],
                'employee_name'      => $emp['first_name'] . ' ' . $emp['last_name'],
                'employee_number'    => $emp['employee_number'],
                'basic_salary'       => $basic,
                'housing_allowance'  => $housing,
                'transport_allowance'=> $transport,
                'other_allowances'   => $otherAllow,
                'gross_pay'          => $gross,
                'nssf_employee'      => $nssfEmp,
                'nssf_employer'      => $nssfEmpr,
                'paye'               => $paye,
                'other_deductions'   => $otherDed,
                'total_deductions'   => $totalDed,
                'net_pay'            => $net,
                'payment_status'     => 'pending',
            ];
        }

        return compact('items', 'totalGross', 'totalDeduct', 'totalNet');
    }

    public function createRun(int $parishId, int $month, int $year, int $createdBy): int
    {
        $existing = Database::selectOne(
            "SELECT id FROM payroll_runs WHERE parish_id = ? AND period_month = ? AND period_year = ?",
            [$parishId, $month, $year]
        );
        if ($existing) {
            return $existing['id'];
        }

        $run = $this->generateRun($parishId, $month, $year, $createdBy);

        $runNumber = 'PAY-' . $year . str_pad($month, 2, '0', STR_PAD_LEFT) . '-' . str_pad(rand(1, 999), 3, '0', STR_PAD_LEFT);

        $runId = Database::insert(
            "INSERT INTO payroll_runs (parish_id, run_number, period_month, period_year, total_gross, total_deductions, total_net, employee_count, status, created_by, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())",
            [$parishId, $runNumber, $month, $year, $run['totalGross'], $run['totalDeduct'], $run['totalNet'], count($run['items']), 'draft', $createdBy]
        );

        foreach ($run['items'] as $item) {
            Database::execute(
                "INSERT INTO payroll_run_items (payroll_run_id, employee_id, basic_salary, housing_allowance, transport_allowance, other_allowances, gross_pay, nssf_employee, nssf_employer, paye, other_deductions, total_deductions, net_pay, payment_status)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [$runId, $item['employee_id'], $item['basic_salary'], $item['housing_allowance'], $item['transport_allowance'], $item['other_allowances'], $item['gross_pay'], $item['nssf_employee'], $item['nssf_employer'], $item['paye'], $item['other_deductions'], $item['total_deductions'], $item['net_pay'], $item['payment_status']]
            );
        }

        return $runId;
    }
}
