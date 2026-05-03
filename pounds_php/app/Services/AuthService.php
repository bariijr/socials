<?php
namespace App\Services;

use App\Core\Database;
use App\Models\User;

class AuthService {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function login(string $email, string $password): ?array {
        $user = $this->db->fetch(
            "SELECT id, email, password, role, status, firstName, lastName FROM users WHERE email = ? LIMIT 1",
            [$email]
        );

        if (!$user || !password_verify($password, $user['password'])) {
            return null;
        }

        if ($user['status'] === 'suspended') {
            return null;
        }

        unset($user['password']);
        return $user;
    }

    public function register(array $data): bool {
        $data['password'] = password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => 12]);
        $data['role'] = 'user';
        $data['status'] = 'pending';
        $data['notificationPreferences'] = json_encode(['email' => true, 'sms' => true, 'whatsapp' => false, 'push' => true]);

        $sql = "INSERT INTO users (email, password, firstName, lastName, phone, role, status, notificationPreferences) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        return (bool) $this->db->insert($sql, [
            $data['email'],
            $data['password'],
            $data['firstName'],
            $data['lastName'],
            $data['phone'] ?? null,
            $data['role'],
            $data['status'],
            $data['notificationPreferences']
        ]);
    }
}
