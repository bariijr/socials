<?php

namespace App\Modules\MassSchedules;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;

class MassController extends Controller
{
    private static array $days = ['Jumapili','Jumatatu','Jumanne','Jumatano','Alhamisi','Ijumaa','Jumamosi'];
    private static array $langs = ['sw' => 'Kiswahili', 'en' => 'Kiingereza', 'latin' => 'Kilatini', 'other' => 'Nyingine'];

    public function __construct()
    {
        $this->requireAuth();
        $this->requirePermission('mass_view');
    }

    public function index(): void
    {
        $pid   = Auth::parishId();
        $rows  = Database::select(
            "SELECT * FROM mass_schedules WHERE parish_id=? ORDER BY day_of_week ASC, mass_time ASC",
            [$pid]
        );
        $days  = self::$days;
        $langs = self::$langs;
        $this->view('MassSchedules/views/index', compact('rows', 'days', 'langs'));
    }

    public function store(): void
    {
        $this->requirePermission('mass_manage');
        $this->verifyCsrf();

        Database::insert(
            "INSERT INTO mass_schedules (parish_id, day_of_week, mass_time, location, language, is_special, special_note, sort_order, created_at)
             VALUES (?,?,?,?,?,?,?,?,NOW())",
            [
                Auth::parishId(),
                (int) $_POST['day_of_week'],
                $_POST['mass_time'],
                trim($_POST['location'] ?? '') ?: null,
                $_POST['language'] ?? 'sw',
                !empty($_POST['is_special']) ? 1 : 0,
                trim($_POST['special_note'] ?? '') ?: null,
                (int) ($_POST['sort_order'] ?? 0),
            ]
        );

        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Ratiba ya Misa imehifadhiwa.'];
        redirect('/mass-schedules');
    }

    public function destroy(int $id): void
    {
        $this->requirePermission('mass_manage');
        $this->verifyCsrf();
        Database::execute("DELETE FROM mass_schedules WHERE id=? AND parish_id=?", [$id, Auth::parishId()]);
        redirect('/mass-schedules');
    }

    public function toggle(int $id): void
    {
        $this->requirePermission('mass_manage');
        $this->verifyCsrf();
        $s = Database::selectOne("SELECT active FROM mass_schedules WHERE id=? AND parish_id=?", [$id, Auth::parishId()]);
        if ($s) Database::execute("UPDATE mass_schedules SET active=? WHERE id=?", [$s['active'] ? 0 : 1, $id]);
        redirect('/mass-schedules');
    }
}
