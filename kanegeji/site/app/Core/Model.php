<?php

namespace App\Core;

abstract class Model
{
    protected string $table    = '';
    protected string $primaryKey = 'id';
    protected int    $parishId   = 1;

    public function __construct()
    {
        $this->parishId = Auth::parishId();
    }

    protected function db(): Database
    {
        return new Database();
    }

    public function find(int $id): array|false
    {
        return Database::selectOne(
            "SELECT * FROM {$this->table} WHERE {$this->primaryKey} = ? AND parish_id = ? AND deleted_at IS NULL LIMIT 1",
            [$id, $this->parishId]
        );
    }

    public function findOrFail(int $id): array
    {
        $row = $this->find($id);
        if (!$row) {
            http_response_code(404);
            require BASE_PATH . '/public_html/views/errors/404.php';
            exit;
        }
        return $row;
    }

    public function all(string $orderBy = 'created_at DESC'): array
    {
        return Database::select(
            "SELECT * FROM {$this->table} WHERE parish_id = ? AND deleted_at IS NULL ORDER BY {$orderBy}",
            [$this->parishId]
        );
    }

    public function count(string $where = '', array $params = []): int
    {
        $baseParams = [$this->parishId];
        $sql = "SELECT COUNT(*) as cnt FROM {$this->table} WHERE parish_id = ? AND deleted_at IS NULL";
        if ($where) {
            $sql .= " AND {$where}";
            $params = array_merge($baseParams, $params);
        } else {
            $params = $baseParams;
        }
        $row = Database::selectOne($sql, $params);
        return (int) ($row['cnt'] ?? 0);
    }

    public function create(array $data): string
    {
        $data['parish_id']  = $this->parishId;
        $data['created_at'] = date('Y-m-d H:i:s');
        $data['updated_at'] = date('Y-m-d H:i:s');

        $cols = implode(', ', array_keys($data));
        $placeholders = implode(', ', array_fill(0, count($data), '?'));

        Database::insert(
            "INSERT INTO {$this->table} ({$cols}) VALUES ({$placeholders})",
            array_values($data)
        );
        return Database::lastId();
    }

    public function update(int $id, array $data): int
    {
        $data['updated_at'] = date('Y-m-d H:i:s');
        $sets = implode(', ', array_map(fn($k) => "{$k} = ?", array_keys($data)));

        return Database::execute(
            "UPDATE {$this->table} SET {$sets} WHERE {$this->primaryKey} = ? AND parish_id = ?",
            [...array_values($data), $id, $this->parishId]
        );
    }

    public function softDelete(int $id): int
    {
        return Database::execute(
            "UPDATE {$this->table} SET deleted_at = ? WHERE {$this->primaryKey} = ? AND parish_id = ?",
            [date('Y-m-d H:i:s'), $id, $this->parishId]
        );
    }

    public function paginate(int $page, int $perPage, string $where = '', array $params = [], string $orderBy = 'created_at DESC'): array
    {
        $offset     = ($page - 1) * $perPage;
        $baseWhere  = "parish_id = ? AND deleted_at IS NULL";
        $baseParams = [$this->parishId];

        if ($where) {
            $fullWhere  = "{$baseWhere} AND {$where}";
            $allParams  = array_merge($baseParams, $params);
        } else {
            $fullWhere = $baseWhere;
            $allParams = $baseParams;
        }

        $total = (int) (Database::selectOne(
            "SELECT COUNT(*) as cnt FROM {$this->table} WHERE {$fullWhere}",
            $allParams
        )['cnt'] ?? 0);

        $rows = Database::select(
            "SELECT * FROM {$this->table} WHERE {$fullWhere} ORDER BY {$orderBy} LIMIT {$perPage} OFFSET {$offset}",
            [...$allParams]
        );

        return [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int) ceil($total / $perPage),
            'from'         => $total > 0 ? $offset + 1 : 0,
            'to'           => min($offset + $perPage, $total),
        ];
    }
}
