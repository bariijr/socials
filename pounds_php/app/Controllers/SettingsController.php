<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;

class SettingsController extends Controller {
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->db = Database::getInstance();
    }

    public function index() {
        $this->requireAuth();

        $settings = $this->db->fetchAll("SELECT `key`, value, type, description FROM settings ORDER BY `key`");
        return $this->json($settings);
    }

    public function show($key) {
        $this->requireAuth();

        $setting = $this->db->fetch("SELECT * FROM settings WHERE `key` = ?", [$key]);
        if (!$setting) return $this->error('Setting not found', 404);

        return $this->json($setting);
    }

    public function store() {
        $this->requireAuth();
        $this->requireRole('super_admin');

        $data = $this->request->getBody();
        if (empty($data['key']) || !isset($data['value'])) {
            return $this->error('key and value are required', 422);
        }

        $existing = $this->db->fetch("SELECT id FROM settings WHERE `key` = ?", [$data['key']]);

        if ($existing) {
            $this->db->update("UPDATE settings SET value = ? WHERE `key` = ?", [$data['value'], $data['key']]);
        } else {
            $this->db->insert(
                "INSERT INTO settings (`key`, value, type, description) VALUES (?, ?, ?, ?)",
                [$data['key'], $data['value'], $data['type'] ?? 'string', $data['description'] ?? null]
            );
        }

        return $this->json(['message' => 'Setting saved']);
    }
}
