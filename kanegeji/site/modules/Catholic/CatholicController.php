<?php

namespace App\Modules\Catholic;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;

class CatholicController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
    }

    public function prayers(): void
    {
        $lang    = $_GET['lang'] ?? 'sw';
        $type    = $_GET['type'] ?? 'prayer';
        $prayers = Database::select(
            "SELECT * FROM catholic_content WHERE type=? AND language=? AND active=1 ORDER BY sort_order ASC",
            [$type, $lang]
        );
        $types = ['prayer' => 'Sala', 'reading' => 'Masomo', 'devotion' => 'Ibada', 'novena' => 'Novena', 'catechism' => 'Katekisimu', 'saint' => 'Watakatifu'];
        $this->view('Catholic/views/prayers', compact('prayers', 'types', 'type', 'lang'));
    }

    public function calendar(): void
    {
        $year  = (int) ($_GET['year'] ?? date('Y'));
        $month = (int) ($_GET['month'] ?? date('n'));

        // Liturgical seasons — simplified calculation
        $seasons = $this->getLiturgicalCalendar($year, $month);

        $this->view('Catholic/views/calendar', compact('seasons', 'year', 'month'));
    }

    private function getLiturgicalCalendar(int $year, int $month): array
    {
        // Calculate Easter (Butcher/Meeus algorithm)
        $a = $year % 19;
        $b = intdiv($year, 100);
        $c = $year % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $easterMonth = intdiv($h + $l - 7 * $m + 114, 31);
        $easterDay   = (($h + $l - 7 * $m + 114) % 31) + 1;
        $easter      = mktime(0, 0, 0, $easterMonth, $easterDay, $year);

        $feasts = [
            date('m-d', strtotime('-46 days', $easter))  => ['name' => 'Jumatano ya Majivu', 'season' => 'Kwaresima', 'color' => 'purple'],
            date('m-d', strtotime('-7 days', $easter))   => ['name' => 'Jumapili ya Matawi', 'season' => 'Juma Takatifu', 'color' => 'red'],
            date('m-d', strtotime('-3 days', $easter))   => ['name' => 'Alhamisi ya Bwana', 'season' => 'Pasaka', 'color' => 'white'],
            date('m-d', strtotime('-2 days', $easter))   => ['name' => 'Ijumaa ya Mateso', 'season' => 'Mateso', 'color' => 'red'],
            date('m-d', $easter)                         => ['name' => 'Pasaka ya Bwana', 'season' => 'Pasaka', 'color' => 'gold'],
            date('m-d', strtotime('+39 days', $easter))  => ['name' => 'Kupaa kwa Bwana', 'season' => 'Kupaa', 'color' => 'white'],
            date('m-d', strtotime('+49 days', $easter))  => ['name' => 'Jumapili ya Pentekoste', 'season' => 'Pentekoste', 'color' => 'red'],
            '01-01' => ['name' => 'Mwaka Mpya / Maria Mama wa Mungu', 'season' => 'Noeli', 'color' => 'white'],
            '01-06' => ['name' => 'Epifania (Siku ya Nyota)', 'season' => 'Noeli', 'color' => 'white'],
            '08-15' => ['name' => 'Kupalizwa kwa Maria', 'season' => 'Kawaida', 'color' => 'white'],
            '11-01' => ['name' => 'Sikukuu ya Watakatifu Wote', 'season' => 'Watakatifu', 'color' => 'white'],
            '12-08' => ['name' => 'Mimba Safi ya Maria', 'season' => 'Adventu', 'color' => 'blue'],
            '12-25' => ['name' => 'Noeli — Kuzaliwa kwa Bwana', 'season' => 'Noeli', 'color' => 'gold'],
        ];

        // Filter by requested month
        $monthStr = sprintf('%02d', $month);
        $result   = [];
        foreach ($feasts as $mmdd => $feast) {
            if (str_starts_with($mmdd, $monthStr . '-')) {
                $result[sprintf('%s-%d', $mmdd, $year)] = $feast + ['date' => sprintf('%d-%s', $year, $mmdd)];
            }
        }
        ksort($result);
        return $result;
    }
}
