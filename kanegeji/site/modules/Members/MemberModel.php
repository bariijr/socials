<?php

namespace App\Modules\Members;

use App\Core\{Auth, Database, Model};

class MemberModel extends Model
{
    protected string $table = 'members';

    public function search(string $q, int $page = 1, int $perPage = 20, array $filters = []): array
    {
        $conditions = ['m.parish_id = ?', 'm.deleted_at IS NULL'];
        $params     = [$this->parishId];

        if ($q) {
            $conditions[] = "MATCH(m.first_name, m.middle_name, m.last_name) AGAINST(? IN BOOLEAN MODE)";
            $params[]     = $q . '*';
        }
        if (!empty($filters['status'])) {
            $conditions[] = 'm.status = ?';
            $params[]     = $filters['status'];
        }
        if (!empty($filters['community_id'])) {
            $conditions[] = 'm.community_id = ?';
            $params[]     = (int) $filters['community_id'];
        }
        if (!empty($filters['gender'])) {
            $conditions[] = 'm.gender = ?';
            $params[]     = $filters['gender'];
        }

        $where  = implode(' AND ', $conditions);
        $offset = ($page - 1) * $perPage;

        $total = Database::selectOne(
            "SELECT COUNT(*) as cnt FROM members m WHERE {$where}",
            $params
        )['cnt'] ?? 0;

        $rows = Database::select(
            "SELECT m.*, c.name as community_name
             FROM members m
             LEFT JOIN communities c ON c.id = m.community_id
             WHERE {$where}
             ORDER BY m.last_name ASC, m.first_name ASC
             LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return [
            'data'         => $rows,
            'total'        => (int) $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int) ceil($total / $perPage),
            'from'         => $total > 0 ? $offset + 1 : 0,
            'to'           => min($offset + $perPage, $total),
        ];
    }

    public function getWithDetails(int $id): array|false
    {
        return Database::selectOne(
            "SELECT m.*, c.name as community_name, f.family_name
             FROM members m
             LEFT JOIN communities c ON c.id = m.community_id
             LEFT JOIN families f ON f.id = m.family_id
             WHERE m.id = ? AND m.parish_id = ? AND m.deleted_at IS NULL",
            [$id, $this->parishId]
        );
    }

    public function getSacraments(int $memberId): array
    {
        return Database::select(
            "SELECT * FROM sacraments WHERE member_id = ? AND parish_id = ? ORDER BY date_received DESC",
            [$memberId, $this->parishId]
        );
    }

    public function getTransactions(int $memberId, int $limit = 10): array
    {
        return Database::select(
            "SELECT t.*, tc.name as category_name FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             WHERE t.member_id = ? AND t.parish_id = ? AND t.deleted_at IS NULL
             ORDER BY t.transaction_date DESC LIMIT {$limit}",
            [$memberId, $this->parishId]
        );
    }

    public function generateMemberNumber(): string
    {
        $year = date('Y');
        $last = Database::selectOne(
            "SELECT member_number FROM members WHERE parish_id = ? AND member_number LIKE ? ORDER BY id DESC LIMIT 1",
            [$this->parishId, "KNG-{$year}-%"]
        );

        if ($last) {
            $seq = (int) explode('-', $last['member_number'])[2] + 1;
        } else {
            $seq = 1;
        }

        return sprintf('KNG-%s-%04d', $year, $seq);
    }
}
