<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;

class UserController extends Controller {
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->db = Database::getInstance();
    }

    public function index() {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $page = (int) $this->request->getQuery('page', 1);
        $role = $this->request->getQuery('role');
        $status = $this->request->getQuery('status');
        $search = $this->request->getQuery('search');

        $sql = "SELECT id, email, firstName, lastName, phone, role, status, createdAt, lastLoginAt FROM users WHERE deletedAt IS NULL";
        $params = [];

        if ($role) { $sql .= " AND role = ?"; $params[] = $role; }
        if ($status) { $sql .= " AND status = ?"; $params[] = $status; }
        if ($search) {
            $sql .= " AND (firstName LIKE ? OR lastName LIKE ? OR email LIKE ?)";
            $params[] = "%$search%"; $params[] = "%$search%"; $params[] = "%$search%";
        }

        $total = (int) $this->db->fetch(
            "SELECT COUNT(*) as count FROM users WHERE deletedAt IS NULL" .
            ($role ? " AND role = '$role'" : "") . ($status ? " AND status = '$status'" : ""),
            []
        )['count'];

        $sql .= " ORDER BY createdAt DESC LIMIT 20 OFFSET " . (($page - 1) * 20);
        $users = $this->db->fetchAll($sql, $params);

        return $this->json(['users' => $users, 'page' => $page, 'total' => $total, 'pages' => ceil($total / 20)]);
    }

    public function show($id) {
        $this->requireAuth();

        $currentUser = $this->getUser();
        if ($currentUser['role'] === 'user' && $currentUser['id'] !== $id) {
            return $this->error('Forbidden', 403);
        }

        $user = $this->db->fetch(
            "SELECT id, email, firstName, lastName, phone, role, status, address, nationalId, createdAt, lastLoginAt FROM users WHERE id = ? AND deletedAt IS NULL",
            [$id]
        );

        if (!$user) return $this->error('User not found', 404);

        return $this->json($user);
    }

    public function update($id) {
        $this->requireAuth();

        $currentUser = $this->getUser();
        if ($currentUser['role'] === 'user' && $currentUser['id'] !== $id) {
            return $this->error('Forbidden', 403);
        }

        $data = $this->request->getBody();
        $allowed = ['firstName', 'lastName', 'phone', 'address'];

        if (in_array($currentUser['role'], ['admin', 'super_admin'])) {
            $allowed[] = 'status';
            $allowed[] = 'role';
        }

        $updates = [];
        $params = [];
        foreach ($allowed as $field) {
            if (isset($data[$field])) {
                $updates[] = "$field = ?";
                $params[] = $data[$field];
            }
        }

        if (empty($updates)) return $this->error('No valid fields to update', 400);

        $params[] = $id;
        $this->db->update("UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?", $params);

        return $this->json(['message' => 'User updated']);
    }

    public function profile($id) {
        $this->requireAuth();

        $currentUser = $this->getUser();
        if ($currentUser['role'] === 'user' && $currentUser['id'] !== $id) {
            return $this->error('Forbidden', 403);
        }

        $user = $this->db->fetch(
            "SELECT id, email, firstName, lastName, phone, role, status, address, nationalId, createdAt FROM users WHERE id = ?",
            [$id]
        );
        if (!$user) return $this->error('User not found', 404);

        $loans = $this->db->fetchAll(
            "SELECT id, loanNumber, principalAmount, status, createdAt FROM loans WHERE borrowerId = ? ORDER BY createdAt DESC LIMIT 5",
            [$id]
        );

        $kycStatus = $this->db->fetch(
            "SELECT id, status FROM kyc_forms WHERE userId = ? ORDER BY createdAt DESC LIMIT 1",
            [$id]
        );

        return $this->json(['user' => $user, 'loans' => $loans, 'kyc' => $kycStatus]);
    }
}
