<?php

namespace App\Modules\Families;

use App\Core\Model;
use App\Core\Database;

class FamilyModel extends Model
{
    protected string $table = 'families';

    public function search(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ['f.parish_id = ?'];
        $params = [$this->parishId];

        if (!empty($filters['q'])) {
            $where[]  = 'f.family_name LIKE ?';
            $params[] = '%' . $filters['q'] . '%';
        }
        if (!empty($filters['community_id'])) {
            $where[]  = 'f.community_id = ?';
            $params[] = $filters['community_id'];
        }

        $whereStr = implode(' AND ', $where);
        $total    = Database::selectOne("SELECT COUNT(*) as cnt FROM families f WHERE {$whereStr}", $params)['cnt'];
        $offset   = ($page - 1) * $perPage;
        $rows     = Database::select(
            "SELECT f.*, c.name as community_name,
                    (SELECT COUNT(*) FROM members m WHERE m.family_id = f.id AND m.deleted_at IS NULL) as member_count
             FROM families f LEFT JOIN communities c ON c.id = f.community_id
             WHERE {$whereStr} ORDER BY f.family_name LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return compact('rows', 'total', 'page', 'perPage');
    }

    public function getMembers(int $familyId): array
    {
        return Database::select(
            "SELECT m.*, c.name as community_name FROM members m LEFT JOIN communities c ON c.id = m.community_id WHERE m.family_id = ? AND m.deleted_at IS NULL ORDER BY m.first_name",
            [$familyId]
        );
    }
}
