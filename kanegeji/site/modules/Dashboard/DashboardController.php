<?php

namespace App\Modules\Dashboard;

use App\Core\Controller;

class DashboardController extends Controller
{
    public function index(): void
    {
        $this->requireAuth();

        $service = new DashboardService();

        $this->view('Dashboard/views/index', [
            'pageTitle'    => __('nav.dashboard', 'Dashibodi'),
            'summary'      => $service->getSummary(),
            'recentTx'     => $service->getRecentTransactions(),
            'chartData'    => $service->getMonthlyChartData(),
            'communities'  => $service->getTopCommunities(),
        ]);
    }
}
