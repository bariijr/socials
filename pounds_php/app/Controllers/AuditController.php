<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;

class AuditController extends Controller {
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->db = Database::getInstance();
    }

    public function index() {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $page = (int) $this->request->getQuery('page', 1);
        $entity = $this->request->getQuery('entity');
        $action = $this->request->getQuery('action');
        $userId = $this->request->getQuery('userId');
        $from = $this->request->getQuery('from');
        $to = $this->request->getQuery('to');

        $sql = "SELECT a.*, u.firstName, u.lastName FROM audit_logs a LEFT JOIN users u ON a.userId = u.id WHERE 1=1";
        $params = [];

        if ($entity) { $sql .= " AND a.entity = ?"; $params[] = $entity; }
        if ($action) { $sql .= " AND a.action = ?"; $params[] = $action; }
        if ($userId) { $sql .= " AND a.userId = ?"; $params[] = $userId; }
        if ($from) { $sql .= " AND a.createdAt >= ?"; $params[] = $from; }
        if ($to) { $sql .= " AND a.createdAt <= ?"; $params[] = $to . ' 23:59:59'; }

        $total = (int) $this->db->fetch(
            "SELECT COUNT(*) as count FROM audit_logs WHERE 1=1",
            []
        )['count'];

        $sql .= " ORDER BY a.createdAt DESC LIMIT 50 OFFSET " . (($page - 1) * 50);
        $logs = $this->db->fetchAll($sql, $params);

        return $this->json(['logs' => $logs, 'page' => $page, 'total' => $total]);
    }
}
