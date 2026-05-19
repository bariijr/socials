<?php

namespace App\Modules\Reports;

use App\Core\{Audit, Auth, Controller, Database, Excel, PDF, Request, Session};

class ReportController extends Controller
{
    public function index(): void
    {
        $this->requirePermission('reports.view');
        $this->view('Reports/views/index', ['pageTitle' => __('reports.title', 'Ripoti')]);
    }

    public function income(): void
    {
        $this->requirePermission('reports.view');
        $this->renderFinancialReport('income');
    }

    public function expenses(): void
    {
        $this->requirePermission('reports.view');
        $this->renderFinancialReport('expense');
    }

    private function renderFinancialReport(string $type): void
    {
        $pid      = Auth::parishId();
        $dateFrom = Request::date('date_from', date('Y-m-01'));
        $dateTo   = Request::date('date_to', date('Y-m-t'));

        $summary = Database::selectOne(
            "SELECT SUM(amount) as total, COUNT(*) as count
             FROM transactions
             WHERE parish_id = ? AND type = ? AND status = 'approved' AND deleted_at IS NULL
             AND transaction_date BETWEEN ? AND ?",
            [$pid, $type, $dateFrom, $dateTo]
        );

        $byCategory = Database::select(
            "SELECT tc.name as category, SUM(t.amount) as total, COUNT(*) as count
             FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             WHERE t.parish_id = ? AND t.type = ? AND t.status = 'approved' AND t.deleted_at IS NULL
             AND t.transaction_date BETWEEN ? AND ?
             GROUP BY t.category_id, tc.name
             ORDER BY total DESC",
            [$pid, $type, $dateFrom, $dateTo]
        );

        $byMonth = Database::select(
            "SELECT DATE_FORMAT(transaction_date, '%Y-%m') as month, SUM(amount) as total
             FROM transactions
             WHERE parish_id = ? AND type = ? AND status = 'approved' AND deleted_at IS NULL
             AND transaction_date BETWEEN ? AND ?
             GROUP BY month ORDER BY month",
            [$pid, $type, $dateFrom, $dateTo]
        );

        $transactions = Database::select(
            "SELECT t.*, tc.name as category_name, pm.name as payment_method_name
             FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
             WHERE t.parish_id = ? AND t.type = ? AND t.status = 'approved' AND t.deleted_at IS NULL
             AND t.transaction_date BETWEEN ? AND ?
             ORDER BY t.transaction_date DESC",
            [$pid, $type, $dateFrom, $dateTo]
        );

        $pageTitle = $type === 'income' ? 'Ripoti ya Mapato' : 'Ripoti ya Matumizi';
        Audit::log('report.view', 'Reports', '', 0, [], ['type' => $type, 'from' => $dateFrom, 'to' => $dateTo]);

        $this->view('Reports/views/financial', [
            'pageTitle'    => $pageTitle,
            'type'         => $type,
            'dateFrom'     => $dateFrom,
            'dateTo'       => $dateTo,
            'summary'      => $summary,
            'byCategory'   => $byCategory,
            'byMonth'      => $byMonth,
            'transactions' => $transactions,
        ]);
    }

    public function members(): void
    {
        $this->requirePermission('reports.view');
        $pid = Auth::parishId();

        $byGender = Database::select(
            "SELECT gender, COUNT(*) as count FROM members WHERE parish_id = ? AND status = 'active' AND deleted_at IS NULL GROUP BY gender",
            [$pid]
        );

        $byCommunity = Database::select(
            "SELECT c.name, COUNT(m.id) as count
             FROM communities c LEFT JOIN members m ON m.community_id = c.id AND m.status = 'active' AND m.deleted_at IS NULL
             WHERE c.parish_id = ? GROUP BY c.id, c.name ORDER BY count DESC",
            [$pid]
        );

        $byStatus = Database::select(
            "SELECT status, COUNT(*) as count FROM members WHERE parish_id = ? AND deleted_at IS NULL GROUP BY status",
            [$pid]
        );

        $this->view('Reports/views/members', [
            'pageTitle'   => 'Ripoti ya Wanachama',
            'byGender'    => $byGender,
            'byCommunity' => $byCommunity,
            'byStatus'    => $byStatus,
        ]);
    }

    public function jumuiya(): void
    {
        $this->requirePermission('reports.view');
        $this->view('Reports/views/jumuiya', ['pageTitle' => 'Ripoti ya Jumuiya']);
    }

    public function comparison(): void
    {
        $this->requirePermission('reports.view');

        $pid  = Auth::parishId();
        $year = (int) Request::get('year', date('Y'));
        $year = max(2020, min((int) date('Y'), $year));

        $thisYear = Database::select(
            "SELECT DATE_FORMAT(transaction_date, '%Y-%m') as month,
                    SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) as income,
                    SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
             FROM transactions
             WHERE parish_id=? AND status='approved' AND deleted_at IS NULL
               AND YEAR(transaction_date)=?
             GROUP BY month ORDER BY month",
            [$pid, $year]
        );

        $prevYear = Database::select(
            "SELECT DATE_FORMAT(transaction_date, '%Y-%m') as month,
                    SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) as income,
                    SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
             FROM transactions
             WHERE parish_id=? AND status='approved' AND deleted_at IS NULL
               AND YEAR(transaction_date)=?
             GROUP BY month ORDER BY month",
            [$pid, $year - 1]
        );

        Audit::log('report.comparison', 'Reports', '', 0, [], ['year' => $year]);

        $this->view('Reports/views/comparison', [
            'pageTitle' => 'Ulinganisho wa Fedha',
            'year'      => $year,
            'thisYear'  => $thisYear,
            'prevYear'  => $prevYear,
        ]);
    }

    public function export(): void
    {
        $this->requirePermission('reports.export');
        $this->verifyCsrf();

        $type     = Request::post('type', 'income');
        $dateFrom = Request::post('date_from', date('Y-m-01'));
        $dateTo   = Request::post('date_to', date('Y-m-t'));
        $year     = (int) Request::post('year', (int) date('Y'));
        $pid      = Auth::parishId();

        Audit::log('report.export', 'Reports', '', 0, [], ['type' => $type]);

        match ($type) {
            'expense'    => $this->exportFinancial('expense',  $dateFrom, $dateTo, $pid),
            'members'    => $this->exportMembers($pid),
            'jumuiya'    => $this->exportJumuiya($pid),
            'comparison' => $this->exportComparison($year, $pid),
            default      => $this->exportFinancial('income',   $dateFrom, $dateTo, $pid),
        };
    }

    // ── Private export helpers ─────────────────────────────────────────────────

    private function parishName(): string
    {
        $p = Database::selectOne("SELECT name FROM parishes WHERE id = ?", [Auth::parishId()]);
        return $p['name'] ?? config('app.name', 'Parish ERP');
    }

    private function metaRows(Excel $xl, string $col, string $title, string $subtitle): void
    {
        $xl->cell('A1', $this->parishName())
           ->styleRange('A1:' . $col . '1', [
               'font' => ['bold' => true, 'size' => 13],
               'fill' => ['fillType' => \PhpOffice\PhpSpreadsheet\Style\Fill::FILL_SOLID, 'startColor' => ['rgb' => 'EEF2FF']],
           ])
           ->mergeCells('A1:' . $col . '1')
           ->cell('A2', $title)
           ->styleRange('A2:' . $col . '2', ['font' => ['bold' => true, 'size' => 11]])
           ->mergeCells('A2:' . $col . '2')
           ->cell('A3', $subtitle)
           ->mergeCells('A3:' . $col . '3');
    }

    private function exportFinancial(string $type, string $dateFrom, string $dateTo, int $pid): void
    {
        $typeName = $type === 'income' ? 'Mapato' : 'Matumizi';
        $period   = formatDate($dateFrom) . ' — ' . formatDate($dateTo);

        $byCategory = Database::select(
            "SELECT COALESCE(tc.name, 'Isiyojulikana') as category,
                    COUNT(*) as cnt, SUM(t.amount) as total
             FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             WHERE t.parish_id = ? AND t.type = ? AND t.status = 'approved' AND t.deleted_at IS NULL
               AND t.transaction_date BETWEEN ? AND ?
             GROUP BY t.category_id, tc.name ORDER BY total DESC",
            [$pid, $type, $dateFrom, $dateTo]
        );

        $transactions = Database::select(
            "SELECT t.transaction_date, t.reference_no, t.description,
                    COALESCE(tc.name,'—') as category, COALESCE(pm.name,'—') as payment_method,
                    t.amount, t.notes
             FROM transactions t
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
             WHERE t.parish_id = ? AND t.type = ? AND t.status = 'approved' AND t.deleted_at IS NULL
               AND t.transaction_date BETWEEN ? AND ?
             ORDER BY t.transaction_date DESC",
            [$pid, $type, $dateFrom, $dateTo]
        );

        $grandTotal = array_sum(array_column($byCategory, 'total'));

        $xl = Excel::make("Ripoti ya {$typeName}");

        // ── Sheet 1: Summary ──────────────────────────────────────────────────
        $xl->title('Muhtasari');
        $this->metaRows($xl, 'D', "Ripoti ya {$typeName}", $period);

        $xl->headers(['Kategoria', 'Miamala', 'Kiasi (TZS)', '%'], '5');
        $row = 6;
        foreach ($byCategory as $cat) {
            $pct = $grandTotal > 0 ? round((float)$cat['total'] / $grandTotal * 100, 1) : 0;
            $xl->cell('A' . $row, $cat['category'])
               ->cell('B' . $row, (int) $cat['cnt'])
               ->cell('C' . $row, number_format((float)$cat['total'], 2))
               ->cell('D' . $row, $pct . '%');
            $row++;
        }
        // Total row
        $xl->cell('A' . $row, 'JUMLA')
           ->cell('B' . $row, array_sum(array_column($byCategory, 'cnt')))
           ->cell('C' . $row, number_format($grandTotal, 2))
           ->cell('D' . $row, '100%')
           ->styleRange("A{$row}:D{$row}", ['font' => ['bold' => true]]);

        $xl->autoSize();

        // ── Sheet 2: Transactions ─────────────────────────────────────────────
        $xl->addSheet('Miamala');
        $this->metaRows($xl, 'G', "Miamala — {$typeName}", $period);

        $xl->headers(['Tarehe', 'Nambari', 'Maelezo', 'Kategoria', 'Njia ya Malipo', 'Kiasi (TZS)', 'Maelezo Zaidi'], '5');
        $txRows = array_map(fn($r) => [
            $r['transaction_date'],
            $r['reference_no'],
            $r['description'] ?? '',
            $r['category'],
            $r['payment_method'],
            number_format((float)$r['amount'], 2),
            $r['notes'] ?? '',
        ], $transactions);
        $xl->rows($txRows, 6)->autoSize();

        // Activate first sheet before download
        $xl->download("ripoti_{$type}_{$dateFrom}_{$dateTo}");
    }

    private function exportMembers(int $pid): void
    {
        $byGender = Database::select(
            "SELECT COALESCE(gender,'—') as gender, COUNT(*) as count
             FROM members WHERE parish_id = ? AND status='active' AND deleted_at IS NULL
             GROUP BY gender ORDER BY count DESC",
            [$pid]
        );
        $byStatus = Database::select(
            "SELECT status, COUNT(*) as count FROM members
             WHERE parish_id = ? AND deleted_at IS NULL GROUP BY status ORDER BY count DESC",
            [$pid]
        );
        $byCommunity = Database::select(
            "SELECT c.name, COUNT(m.id) as count
             FROM communities c
             LEFT JOIN members m ON m.community_id = c.id AND m.status='active' AND m.deleted_at IS NULL
             WHERE c.parish_id = ? GROUP BY c.id, c.name ORDER BY count DESC",
            [$pid]
        );
        $members = Database::select(
            "SELECT m.member_no, m.first_name, m.last_name, m.gender,
                    m.date_of_birth, m.phone, m.email, m.status,
                    c.name as community_name
             FROM members m
             LEFT JOIN communities c ON c.id = m.community_id
             WHERE m.parish_id = ? AND m.deleted_at IS NULL
             ORDER BY m.last_name, m.first_name",
            [$pid]
        );

        $xl    = Excel::make('Ripoti ya Wanachama');
        $today = date('d M Y');

        // ── Sheet 1: Summary ──────────────────────────────────────────────────
        $xl->title('Muhtasari');
        $this->metaRows($xl, 'C', 'Ripoti ya Wanachama', 'Tarehe: ' . $today);

        $row = 5;
        $xl->cell('A' . $row, 'Kwa Jinsia')
           ->styleRange('A' . $row . ':C' . $row, ['font' => ['bold' => true]]);
        $row++;
        foreach ($byGender as $g) {
            $xl->cell('B' . $row, $g['gender'])->cell('C' . $row, $g['count']);
            $row++;
        }

        $row++;
        $xl->cell('A' . $row, 'Kwa Hali')
           ->styleRange('A' . $row . ':C' . $row, ['font' => ['bold' => true]]);
        $row++;
        foreach ($byStatus as $s) {
            $xl->cell('B' . $row, ucfirst($s['status']))->cell('C' . $row, $s['count']);
            $row++;
        }

        $row++;
        $xl->cell('A' . $row, 'Kwa Jumuiya')
           ->styleRange('A' . $row . ':C' . $row, ['font' => ['bold' => true]]);
        $row++;
        foreach ($byCommunity as $c) {
            $xl->cell('B' . $row, $c['name'])->cell('C' . $row, $c['count']);
            $row++;
        }

        $xl->autoSize();

        // ── Sheet 2: Full member list ─────────────────────────────────────────
        $xl->addSheet('Wanachama');
        $this->metaRows($xl, 'I', 'Orodha ya Wanachama', 'Tarehe: ' . $today);

        $xl->headers(['Nambari', 'Jina la Kwanza', 'Jina la Familia', 'Jinsia', 'Tarehe ya Kuzaliwa', 'Simu', 'Barua Pepe', 'Jumuiya', 'Hali'], '5');
        $memberRows = array_map(fn($m) => [
            $m['member_no']      ?? '',
            $m['first_name']     ?? '',
            $m['last_name']      ?? '',
            $m['gender']         ?? '',
            $m['date_of_birth']  ?? '',
            $m['phone']          ?? '',
            $m['email']          ?? '',
            $m['community_name'] ?? '',
            $m['status']         ?? '',
        ], $members);
        $xl->rows($memberRows, 6)->autoSize();

        $xl->download('ripoti_wanachama_' . date('Y-m-d'));
    }

    private function exportJumuiya(int $pid): void
    {
        $communities = Database::select(
            "SELECT c.name,
                    COUNT(DISTINCT m.id)                                        AS member_count,
                    COALESCE(SUM(CASE WHEN t.type='income'  THEN t.amount END), 0) AS total_income,
                    COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount END), 0) AS total_expense,
                    MAX(t.transaction_date)                                     AS last_tx_date
             FROM communities c
             LEFT JOIN members m  ON m.community_id = c.id AND m.status='active' AND m.deleted_at IS NULL
             LEFT JOIN transactions t ON t.community_id = c.id AND t.status='approved' AND t.deleted_at IS NULL
             WHERE c.parish_id = ?
             GROUP BY c.id, c.name
             ORDER BY total_income DESC",
            [$pid]
        );

        $xl = Excel::make('Ripoti ya Jumuiya');
        $xl->title('Jumuiya');
        $this->metaRows($xl, 'F', 'Ripoti ya Jumuiya', 'Tarehe: ' . date('d M Y'));

        $xl->headers(['Jumuiya', 'Wanachama', 'Mapato (TZS)', 'Matumizi (TZS)', 'Faida (TZS)', 'Muamala wa Mwisho'], '5');

        $rows = array_map(fn($c) => [
            $c['name'],
            (int) $c['member_count'],
            number_format((float)$c['total_income'],  2),
            number_format((float)$c['total_expense'], 2),
            number_format((float)$c['total_income'] - (float)$c['total_expense'], 2),
            $c['last_tx_date'] ?? '—',
        ], $communities);

        $xl->rows($rows, 6)->autoSize()
           ->download('ripoti_jumuiya_' . date('Y-m-d'));
    }

    private function exportComparison(int $year, int $pid): void
    {
        $year = max(2020, min((int) date('Y'), $year));

        $fetch = fn(int $y) => Database::select(
            "SELECT DATE_FORMAT(transaction_date,'%Y-%m') as month,
                    SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) as income,
                    SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
             FROM transactions
             WHERE parish_id=? AND status='approved' AND deleted_at IS NULL AND YEAR(transaction_date)=?
             GROUP BY month ORDER BY month",
            [$pid, $y]
        );

        $thisYear = $fetch($year);
        $prevYear = $fetch($year - 1);
        $thisMap  = array_column($thisYear, null, 'month');
        $prevMap  = array_column($prevYear, null, 'month');

        $monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ago','Sep','Okt','Nov','Des'];

        $xl = Excel::make('Ulinganisho wa Fedha');
        $xl->title('Ulinganisho');
        $this->metaRows($xl, 'H', 'Ulinganisho wa Fedha', "{$year} vs " . ($year - 1));

        $xl->headers([
            'Mwezi',
            "Mapato {$year}", "Mapato " . ($year - 1), 'Tofauti Mapato (%)',
            "Matumizi {$year}", "Matumizi " . ($year - 1), 'Tofauti Matumizi (%)',
            "Faida {$year}",
        ], '5');

        $dataRows = [];
        for ($m = 1; $m <= 12; $m++) {
            $mk  = $year       . '-' . str_pad($m, 2, '0', STR_PAD_LEFT);
            $pm  = ($year - 1) . '-' . str_pad($m, 2, '0', STR_PAD_LEFT);
            $ti  = (float) ($thisMap[$mk]['income']  ?? 0);
            $te  = (float) ($thisMap[$mk]['expense'] ?? 0);
            $pi  = (float) ($prevMap[$pm]['income']  ?? 0);
            $pe  = (float) ($prevMap[$pm]['expense'] ?? 0);
            $diPct = $pi > 0 ? round(($ti - $pi) / $pi * 100, 1) : ($ti > 0 ? 100 : 0);
            $dePct = $pe > 0 ? round(($te - $pe) / $pe * 100, 1) : ($te > 0 ? 100 : 0);

            $dataRows[] = [
                $monthNames[$m - 1],
                number_format($ti, 2), number_format($pi, 2), $diPct . '%',
                number_format($te, 2), number_format($pe, 2), $dePct . '%',
                number_format($ti - $te, 2),
            ];
        }

        // Totals row
        $allTi = array_sum(array_column($thisYear, 'income'));
        $allTe = array_sum(array_column($thisYear, 'expense'));
        $allPi = array_sum(array_column($prevYear, 'income'));
        $allPe = array_sum(array_column($prevYear, 'expense'));
        $diAll = $allPi > 0 ? round(($allTi - $allPi) / $allPi * 100, 1) : 0;
        $deAll = $allPe > 0 ? round(($allTe - $allPe) / $allPe * 100, 1) : 0;
        $dataRows[] = [
            'JUMLA',
            number_format($allTi, 2), number_format($allPi, 2), $diAll . '%',
            number_format($allTe, 2), number_format($allPe, 2), $deAll . '%',
            number_format($allTi - $allTe, 2),
        ];

        $xl->rows($dataRows, 6);
        $totalRow = 6 + count($dataRows);
        $xl->styleRange("A{$totalRow}:H{$totalRow}", ['font' => ['bold' => true]]);
        $xl->autoSize()->download("ripoti_ulinganisho_{$year}");
    }
}
