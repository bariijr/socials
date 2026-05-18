<?php

namespace App\Modules\Accounting;

use App\Core\{Audit, Auth, Controller, Database, Request, Session};

class AccountingController extends Controller
{
    private TransactionModel $model;

    public function __construct()
    {
        $this->model = new TransactionModel();
    }

    private function getFormData(): array
    {
        $pid = Auth::parishId();
        return [
            'categories'     => Database::select("SELECT id, name, type FROM transaction_categories WHERE parish_id = ? AND active = 1 ORDER BY type, name", [$pid]),
            'payment_methods'=> Database::select("SELECT id, name FROM payment_methods WHERE parish_id = ? AND active = 1 ORDER BY name", [$pid]),
            'communities'    => Database::select("SELECT id, name FROM communities WHERE parish_id = ? AND active = 1 ORDER BY name", [$pid]),
            'members'        => Database::select("SELECT id, first_name, last_name FROM members WHERE parish_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY last_name, first_name LIMIT 500", [$pid]),
        ];
    }

    public function index(): void
    {
        $this->requirePermission('accounting.view');
        $this->transactions();
    }

    public function transactions(): void
    {
        $this->requirePermission('accounting.view');

        $page    = max(1, Request::int('page', 1));
        $filters = Request::only(['type', 'status', 'category_id', 'community_id', 'date_from', 'date_to']);

        $dateFrom = $filters['date_from'] ?: date('Y-m-01');
        $dateTo   = $filters['date_to']   ?: date('Y-m-t');

        $paginator = $this->model->search($page, 30, $filters);
        $summary   = $this->model->getSummaryByPeriod($dateFrom, $dateTo);
        $formData  = $this->getFormData();

        $this->view('Accounting/views/transactions/index', array_merge([
            'pageTitle' => __('accounting.transactions', 'Miamala'),
            'paginator' => $paginator,
            'filters'   => $filters,
            'summary'   => $summary,
            'dateFrom'  => $dateFrom,
            'dateTo'    => $dateTo,
        ], $formData));
    }

    public function createTransaction(): void
    {
        $this->requirePermission('accounting.create');

        $this->view('Accounting/views/transactions/create', array_merge([
            'pageTitle'   => __('accounting.add_transaction', 'Ongeza Muamala'),
            'transaction' => [],
        ], $this->getFormData()));
    }

    public function storeTransaction(): void
    {
        $this->requirePermission('accounting.create');
        $this->verifyCsrf();

        $data = Request::only([
            'type', 'category_id', 'payment_method_id', 'member_id', 'community_id',
            'amount', 'description', 'transaction_date', 'notes',
        ]);

        $errors = $this->validate($data, [
            'type'             => 'required',
            'amount'           => 'required|numeric',
            'transaction_date' => 'required',
        ]);

        if ($errors) {
            Session::flash('error', 'Tafadhali sahihisha makosa.');
            $this->view('Accounting/views/transactions/create', array_merge([
                'pageTitle'   => __('accounting.add_transaction', 'Ongeza Muamala'),
                'transaction' => $data,
                'errors'      => $errors,
            ], $this->getFormData()));
            return;
        }

        $data['reference_no']      = $this->model->generateReferenceNo();
        $data['recorded_by']       = Auth::id();
        $data['status']            = 'pending';
        $data['currency']          = config('app.currency', 'TZS');
        $data['category_id']       = $data['category_id'] ?: null;
        $data['payment_method_id'] = $data['payment_method_id'] ?: null;
        $data['member_id']         = $data['member_id'] ?: null;
        $data['community_id']      = $data['community_id'] ?: null;
        $data['amount']            = (float) $data['amount'];

        $id = $this->model->create($data);
        Audit::log('transaction.create', 'Accounting', 'transaction', (int) $id, [], $data);

        Session::flash('success', __('accounting.transaction_saved', 'Muamala umehifadhiwa.'));
        $this->redirect("/accounting/transactions/{$id}");
    }

    public function showTransaction(string $id): void
    {
        $this->requirePermission('accounting.view');

        $tx = $this->model->getWithDetails((int) $id);
        if (!$tx) { $this->redirect('/accounting/transactions'); }

        $receipt = $this->model->getReceipt((int) $id);

        $this->view('Accounting/views/transactions/show', [
            'pageTitle'   => 'Muamala: ' . $tx['reference_no'],
            'transaction' => $tx,
            'receipt'     => $receipt,
        ]);
    }

    public function editTransaction(string $id): void
    {
        $this->requirePermission('accounting.edit');
        $tx = $this->model->getWithDetails((int) $id);
        if (!$tx) { $this->redirect('/accounting/transactions'); }

        if ($tx['status'] === 'approved') {
            Session::flash('error', 'Muamala ulioidhiniwa hauwezi kuhaririwa.');
            $this->redirect("/accounting/transactions/{$id}");
        }

        $this->view('Accounting/views/transactions/create', array_merge([
            'pageTitle'   => 'Hariri Muamala',
            'transaction' => $tx,
            'editing'     => true,
        ], $this->getFormData()));
    }

    public function updateTransaction(string $id): void
    {
        $this->requirePermission('accounting.edit');
        $this->verifyCsrf();

        $old = $this->model->find((int) $id);
        if (!$old || $old['status'] === 'approved') { $this->redirect('/accounting/transactions'); }

        $data = Request::only([
            'type', 'category_id', 'payment_method_id', 'member_id', 'community_id',
            'amount', 'description', 'transaction_date', 'notes',
        ]);

        $data['category_id']       = $data['category_id'] ?: null;
        $data['payment_method_id'] = $data['payment_method_id'] ?: null;
        $data['member_id']         = $data['member_id'] ?: null;
        $data['community_id']      = $data['community_id'] ?: null;
        $data['amount']            = (float) $data['amount'];

        $this->model->update((int) $id, $data);
        Audit::log('transaction.update', 'Accounting', 'transaction', (int) $id, $old, $data);

        Session::flash('success', 'Muamala umesasishwa.');
        $this->redirect("/accounting/transactions/{$id}");
    }

    public function destroyTransaction(string $id): void
    {
        $this->requirePermission('accounting.delete');
        $this->verifyCsrf();

        $tx = $this->model->find((int) $id);
        if (!$tx || $tx['status'] === 'approved') { $this->redirect('/accounting/transactions'); }

        $this->model->softDelete((int) $id);
        Audit::log('transaction.delete', 'Accounting', 'transaction', (int) $id, $tx);

        Session::flash('success', 'Muamala umefutwa.');
        $this->redirect('/accounting/transactions');
    }

    public function approveTransaction(string $id): void
    {
        $this->requirePermission('accounting.approve');
        $this->verifyCsrf();

        $tx     = $this->model->find((int) $id);
        $action = Request::post('action', 'approve');

        if (!$tx || $tx['status'] !== 'pending') { $this->redirect('/accounting/transactions'); }

        $status = $action === 'approve' ? 'approved' : 'rejected';
        $this->model->update((int) $id, [
            'status'      => $status,
            'approved_by' => Auth::id(),
            'approved_at' => date('Y-m-d H:i:s'),
        ]);

        // Auto-create receipt on approval
        if ($status === 'approved') {
            $issuedTo = $tx['first_name'] ? trim($tx['first_name'] . ' ' . $tx['last_name']) : 'Anonymous';
            $this->model->createReceipt((int) $id, $issuedTo, $tx['amount']);
        }

        Audit::log("transaction.{$action}", 'Accounting', 'transaction', (int) $id);

        Session::flash('success', $status === 'approved'
            ? __('accounting.transaction_approved', 'Muamala umeidhinishwa.')
            : __('accounting.transaction_rejected', 'Muamala umekataliwa.'));
        $this->redirect("/accounting/transactions/{$id}");
    }

    public function receipt(string $id): void
    {
        $this->requirePermission('accounting.view');
        $receipt = Database::selectOne(
            "SELECT r.*, t.type, t.description, t.transaction_date, t.amount as tx_amount,
                    tc.name as category_name, p.name as parish_name, p.address as parish_address,
                    u.name as cashier
             FROM receipts r
             JOIN transactions t ON t.id = r.transaction_id
             LEFT JOIN transaction_categories tc ON tc.id = t.category_id
             JOIN parishes p ON p.id = t.parish_id
             JOIN users u ON u.id = r.issued_by
             WHERE r.id = ? AND t.parish_id = ?",
            [$id, Auth::parishId()]
        );

        if (!$receipt) { $this->redirect('/accounting/transactions'); }

        $this->view('Accounting/views/receipt', ['receipt' => $receipt], 'auth');
    }

    public function budgets(): void
    {
        $this->requirePermission('accounting.view');
        $year = Request::int('year', (int) date('Y'));
        $pid  = Auth::parishId();

        $budgets = Database::select(
            "SELECT b.*, tc.name as category_name,
                    COALESCE(SUM(CASE WHEN t.status='approved' THEN t.amount END), 0) as spent
             FROM budgets b
             LEFT JOIN transaction_categories tc ON tc.id = b.category_id
             LEFT JOIN transactions t ON t.category_id = b.category_id
                AND YEAR(t.transaction_date) = b.fiscal_year AND t.parish_id = ?
             WHERE b.parish_id = ? AND b.fiscal_year = ?
             GROUP BY b.id
             ORDER BY tc.name",
            [$pid, $pid, $year]
        );

        $this->view('Accounting/views/budgets', [
            'pageTitle' => 'Bajeti ' . $year,
            'budgets'   => $budgets,
            'year'      => $year,
        ]);
    }

    public function chartOfAccounts(): void
    {
        $this->requirePermission('accounting.view');
        $accounts = Database::select(
            "SELECT ca.*, at.name as type_name FROM chart_of_accounts ca
             JOIN account_types at ON at.id = ca.account_type_id
             WHERE ca.parish_id = ? AND ca.active = 1
             ORDER BY ca.code",
            [Auth::parishId()]
        );
        $this->view('Accounting/views/chart_of_accounts', ['pageTitle' => 'Orodha ya Akaunti', 'accounts' => $accounts]);
    }

    public function reconciliation(): void
    {
        $this->requirePermission('accounting.view');
        $this->view('Accounting/views/reconciliation', ['pageTitle' => 'Uoanishaji wa Benki']);
    }

    public function campaigns(): void
    {
        $this->requirePermission('accounting.view');
        $pid      = Auth::parishId();
        $campaigns = Database::select(
            "SELECT c.*, COALESCE(SUM(cc.amount), 0) as raised
             FROM campaigns c
             LEFT JOIN campaign_contributions cc ON cc.campaign_id = c.id
             WHERE c.parish_id = ?
             GROUP BY c.id
             ORDER BY c.created_at DESC",
            [$pid]
        );
        $this->view('Accounting/views/campaigns', ['pageTitle' => 'Kampeni', 'campaigns' => $campaigns]);
    }

    public function createCampaign(): void
    {
        $this->requirePermission('accounting.create');
        $this->view('Accounting/views/campaign_create', ['pageTitle' => 'Ongeza Kampeni', 'campaign' => []]);
    }

    public function storeCampaign(): void
    {
        $this->requirePermission('accounting.create');
        $this->verifyCsrf();

        $data = Request::only(['title', 'description', 'target_amount', 'start_date', 'end_date', 'visible_public']);
        $data['created_by']     = Auth::id();
        $data['parish_id']      = Auth::parishId();
        $data['status']         = 'active';
        $data['target_amount']  = $data['target_amount'] ?: null;
        $data['visible_public'] = isset($data['visible_public']) ? 1 : 0;

        Database::execute(
            "INSERT INTO campaigns (parish_id, title, description, target_amount, start_date, end_date, visible_public, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            array_values($data)
        );

        Session::flash('success', 'Kampeni imeanzishwa.');
        $this->redirect('/campaigns');
    }

    public function showCampaign(string $id): void
    {
        $this->requirePermission('accounting.view');
        $pid      = Auth::parishId();
        $campaign = Database::selectOne(
            "SELECT c.*, COALESCE(SUM(cc.amount), 0) as raised FROM campaigns c
             LEFT JOIN campaign_contributions cc ON cc.campaign_id = c.id
             WHERE c.id = ? AND c.parish_id = ?",
            [$id, $pid]
        );
        if (!$campaign) { $this->redirect('/campaigns'); }

        $contributions = Database::select(
            "SELECT cc.*, m.first_name, m.last_name, co.name as community_name
             FROM campaign_contributions cc
             LEFT JOIN members m ON m.id = cc.member_id
             LEFT JOIN communities co ON co.id = cc.community_id
             WHERE cc.campaign_id = ?
             ORDER BY cc.created_at DESC LIMIT 50",
            [$id]
        );

        $this->view('Accounting/views/campaign_show', [
            'pageTitle'     => $campaign['title'],
            'campaign'      => $campaign,
            'contributions' => $contributions,
        ]);
    }
}
