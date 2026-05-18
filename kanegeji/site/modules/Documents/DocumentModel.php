<?php

namespace App\Modules\Documents;

use App\Core\Model;
use App\Core\Database;

class DocumentModel extends Model
{
    protected string $table = 'documents';

    public function search(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ['d.parish_id = ?', 'd.deleted_at IS NULL'];
        $params = [$this->parishId];

        if (!empty($filters['q'])) {
            $where[]  = '(d.title LIKE ? OR d.description LIKE ?)';
            $q        = '%' . $filters['q'] . '%';
            $params   = array_merge($params, [$q, $q]);
        }
        if (!empty($filters['category_id'])) {
            $where[]  = 'd.category_id = ?';
            $params[] = $filters['category_id'];
        }

        $whereStr = implode(' AND ', $where);
        $total    = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM documents d WHERE {$whereStr}",
            $params
        )['cnt'];

        $offset = ($page - 1) * $perPage;
        $rows   = Database::select(
            "SELECT d.*, dc.name as category_name, u.first_name, u.last_name
             FROM documents d
             LEFT JOIN document_categories dc ON dc.id = d.category_id
             LEFT JOIN users u ON u.id = d.uploaded_by
             WHERE {$whereStr}
             ORDER BY d.created_at DESC LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return compact('rows', 'total', 'page', 'perPage');
    }

    public function getCategories(): array
    {
        return Database::select("SELECT * FROM document_categories WHERE parish_id = ? ORDER BY name", [$this->parishId]);
    }
}
