<?php
namespace App\Core;

class Model {
    protected $table;
    protected $db;
    protected $fillable = [];

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function all(): array {
        return $this->db->fetchAll("SELECT * FROM {$this->table}");
    }

    public function find($id): ?array {
        return $this->db->fetch(
            "SELECT * FROM {$this->table} WHERE id = ?",
            [$id]
        );
    }

    public function where(string $column, $value): static {
        // Return new query builder instance
        return new QueryBuilder($this->db, $this->table, $column, $value);
    }

    public function create(array $data): ?string {
        $columns = array_intersect_key($data, array_flip($this->fillable));
        $cols = implode(',', array_keys($columns));
        $vals = implode(',', array_fill(0, count($columns), '?'));
        $sql = "INSERT INTO {$this->table} ($cols) VALUES ($vals)";
        return $this->db->insert($sql, array_values($columns));
    }

    public function update(array $data): int {
        $columns = array_intersect_key($data, array_flip($this->fillable));
        $set = implode(',', array_map(fn($k) => "$k = ?", array_keys($columns)));
        $sql = "UPDATE {$this->table} SET $set WHERE id = ?";
        $values = array_values($columns);
        $values[] = $data['id'];
        return $this->db->update($sql, $values);
    }

    public function delete($id): int {
        return $this->db->delete(
            "DELETE FROM {$this->table} WHERE id = ?",
            [$id]
        );
    }
}

class QueryBuilder {
    private $db;
    private $table;
    private $conditions = [];
    private $values = [];
    private $orderBy = '';
    private $limit = '';

    public function __construct(Database $db, string $table, string $column = null, $value = null) {
        $this->db = $db;
        $this->table = $table;
        if ($column && $value !== null) {
            $this->conditions[] = "$column = ?";
            $this->values[] = $value;
        }
    }

    public function where(string $column, $value): static {
        $this->conditions[] = "$column = ?";
        $this->values[] = $value;
        return $this;
    }

    public function orderBy(string $column, string $direction = 'ASC'): static {
        $this->orderBy = "ORDER BY $column $direction";
        return $this;
    }

    public function limit(int $limit): static {
        $this->limit = "LIMIT $limit";
        return $this;
    }

    public function get(): array {
        $sql = "SELECT * FROM {$this->table}";
        if ($this->conditions) {
            $sql .= ' WHERE ' . implode(' AND ', $this->conditions);
        }
        if ($this->orderBy) {
            $sql .= " {$this->orderBy}";
        }
        if ($this->limit) {
            $sql .= " {$this->limit}";
        }
        return $this->db->fetchAll($sql, $this->values);
    }

    public function first(): ?array {
        $this->limit = 'LIMIT 1';
        $result = $this->get();
        return $result[0] ?? null;
    }

    public function count(): int {
        $sql = "SELECT COUNT(*) as count FROM {$this->table}";
        if ($this->conditions) {
            $sql .= ' WHERE ' . implode(' AND ', $this->conditions);
        }
        $result = $this->db->fetch($sql, $this->values);
        return $result['count'] ?? 0;
    }
}
