<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;
use App\Services\LoanService;

class CronController extends Controller {
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->db = Database::getInstance();
    }

    private function checkToken(): bool {
        $token = $this->request->getQuery('token');
        return $token && $token === getenv('CRON_SECRET');
    }

    public function penalties() {
        if (!$this->checkToken()) {
            return $this->error('Unauthorized', 401);
        }

        $loanService = new LoanService();
        $count = $loanService->applyPenalties();

        $this->db->insert(
            "INSERT INTO audit_logs (action, entity, metadata) VALUES ('cron_run', 'penalties', ?)",
            [json_encode(['penaltiesApplied' => $count, 'runAt' => date('Y-m-d H:i:s')])]
        );

        return $this->json(['message' => "Penalties applied to $count loans", 'count' => $count]);
    }

    public function retryNotifications() {
        if (!$this->checkToken()) {
            return $this->error('Unauthorized', 401);
        }

        $pending = $this->db->fetchAll(
            "SELECT * FROM notifications WHERE status = 'failed' AND retryCount < 3 ORDER BY createdAt ASC LIMIT 50"
        );

        $retried = 0;
        foreach ($pending as $notification) {
            $this->db->update(
                "UPDATE notifications SET retryCount = retryCount + 1, status = 'pending' WHERE id = ?",
                [$notification['id']]
            );
            $retried++;
        }

        return $this->json(['message' => "Queued $retried notifications for retry", 'count' => $retried]);
    }
}
