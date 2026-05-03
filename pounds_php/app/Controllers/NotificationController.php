<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;

class NotificationController extends Controller {
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->db = Database::getInstance();
    }

    public function index() {
        $this->requireAuth();

        $userId = $this->getUser()['id'];
        $page = (int) $this->request->getQuery('page', 1);

        $notifications = $this->db->fetchAll(
            "SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 20 OFFSET ?",
            [$userId, ($page - 1) * 20]
        );

        $unread = (int) $this->db->fetch(
            "SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND isRead = 0",
            [$userId]
        )['count'];

        return $this->json(['notifications' => $notifications, 'unread' => $unread]);
    }

    public function markRead($id) {
        $this->requireAuth();

        $notification = $this->db->fetch("SELECT * FROM notifications WHERE id = ?", [$id]);
        if (!$notification) return $this->error('Notification not found', 404);

        if ($notification['userId'] !== $this->getUser()['id']) {
            return $this->error('Forbidden', 403);
        }

        $this->db->update("UPDATE notifications SET isRead = 1, readAt = NOW() WHERE id = ?", [$id]);

        return $this->json(['message' => 'Marked as read']);
    }

    public function markAllRead() {
        $this->requireAuth();

        $this->db->update(
            "UPDATE notifications SET isRead = 1, readAt = NOW() WHERE userId = ? AND isRead = 0",
            [$this->getUser()['id']]
        );

        return $this->json(['message' => 'All notifications marked as read']);
    }
}
