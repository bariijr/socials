<?php

namespace App\Modules\Payroll;

use App\Core\Model;
use App\Core\Database;

class EmployeeModel extends Model
{
    protected string $table = 'employees';

    public function search(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ['e.parish_id = ?', 'e.deleted_at IS NULL'];
        $params = [$this->parishId];

        if (!empty($filters['q'])) {
            $where[]  = '(e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_number LIKE ? OR e.position LIKE ?)';
            $q        = '%' . $filters['q'] . '%';
            $params   = array_merge($params, [$q, $q, $q, $q]);
        }
        if (!empty($filters['status'])) {
            $where[]  = 'e.status = ?';
            $params[] = $filters['status'];
        }
        if (!empty($filters['employment_type'])) {
            $where[]  = 'e.employment_type = ?';
            $params[] = $filters['employment_type'];
        }

        $whereStr = implode(' AND ', $where);
        $total    = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM employees e WHERE {$whereStr}",
            $params
        )['cnt'];

        $offset = ($page - 1) * $perPage;
        $rows   = Database::select(
            "SELECT e.* FROM employees e WHERE {$whereStr} ORDER BY e.first_name, e.last_name LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return compact('rows', 'total', 'page', 'perPage');
    }

    public function getActiveSalary(int $employeeId): ?array
    {
        return Database::selectOne(
            "SELECT * FROM salary_structures WHERE employee_id = ? AND is_active = 1 ORDER BY effective_from DESC LIMIT 1",
            [$employeeId]
        );
    }

    public function generateEmployeeNumber(): string
    {
        $year  = date('Y');
        $prefix = 'EMP-' . $year . '-';
        $last  = Database::selectOne(
            "SELECT employee_number FROM employees WHERE parish_id = ? AND employee_number LIKE ? ORDER BY id DESC LIMIT 1",
            [$this->parishId, $prefix . '%']
        );
        $seq = $last ? ((int) substr($last['employee_number'], -4) + 1) : 1;
        return $prefix . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }
}
