<?php

namespace App\Modules\Inventory;

use App\Core\Model;
use App\Core\Database;

class AssetModel extends Model
{
    protected string $table = 'assets';

    public function search(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ['a.parish_id = ?', 'a.deleted_at IS NULL'];
        $params = [$this->parishId];

        if (!empty($filters['q'])) {
            $where[]  = '(a.name LIKE ? OR a.asset_number LIKE ? OR a.serial_number LIKE ? OR a.location LIKE ?)';
            $q        = '%' . $filters['q'] . '%';
            $params   = array_merge($params, [$q, $q, $q, $q]);
        }
        if (!empty($filters['category_id'])) {
            $where[]  = 'a.category_id = ?';
            $params[] = $filters['category_id'];
        }
        if (!empty($filters['status'])) {
            $where[]  = 'a.status = ?';
            $params[] = $filters['status'];
        }
        if (!empty($filters['condition_status'])) {
            $where[]  = 'a.condition_status = ?';
            $params[] = $filters['condition_status'];
        }

        $whereStr = implode(' AND ', $where);
        $total    = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM assets a WHERE {$whereStr}",
            $params
        )['cnt'];

        $offset = ($page - 1) * $perPage;
        $rows   = Database::select(
            "SELECT a.*, ac.name as category_name FROM assets a LEFT JOIN asset_categories ac ON ac.id = a.category_id WHERE {$whereStr} ORDER BY a.name LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return compact('rows', 'total', 'page', 'perPage');
    }

    public function generateAssetNumber(): string
    {
        $year   = date('Y');
        $prefix = 'AST-' . $year . '-';
        $last   = Database::selectOne(
            "SELECT asset_number FROM assets WHERE parish_id = ? AND asset_number LIKE ? ORDER BY id DESC LIMIT 1",
            [$this->parishId, $prefix . '%']
        );
        $seq = $last ? ((int) substr($last['asset_number'], -4) + 1) : 1;
        return $prefix . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }

    public function getCategories(): array
    {
        return Database::select("SELECT * FROM asset_categories WHERE parish_id = ? ORDER BY name", [$this->parishId]);
    }

    public function getMaintenanceLogs(int $assetId): array
    {
        return Database::select(
            "SELECT ml.*, u.first_name, u.last_name FROM maintenance_logs ml LEFT JOIN users u ON u.id = ml.created_by WHERE ml.asset_id = ? ORDER BY ml.maintenance_date DESC",
            [$assetId]
        );
    }
}
