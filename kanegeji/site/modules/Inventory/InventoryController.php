<?php

namespace App\Modules\Inventory;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;
use App\Core\QRCode;

class InventoryController extends Controller
{
    private AssetModel $model;

    public function __construct()
    {
        $this->requireAuth();
        $this->model = new AssetModel();
    }

    public function index(): void
    {
        $this->requirePermission('inventory_view');
        $filters    = $_GET;
        $page       = max(1, (int) ($_GET['page'] ?? 1));
        $data       = $this->model->search($filters, $page);
        $categories = $this->model->getCategories();
        $summary    = Database::selectOne(
            "SELECT COUNT(*) as total, SUM(current_value) as total_value FROM assets WHERE parish_id = ? AND deleted_at IS NULL AND status = 'active'",
            [Auth::parishId()]
        );
        $this->view('Inventory/views/index', array_merge($data, compact('categories', 'summary')));
    }

    public function create(): void
    {
        $this->requirePermission('inventory_manage');
        $categories = $this->model->getCategories();
        $this->view('Inventory/views/create', compact('categories'));
    }

    public function store(): void
    {
        $this->requirePermission('inventory_manage');
        $this->verifyCsrf();

        $number = $this->model->generateAssetNumber();
        $qrCode = generateCode('AST', 12);

        $id = $this->model->create([
            'parish_id'        => Auth::parishId(),
            'asset_number'     => $number,
            'name'             => $_POST['name'],
            'category_id'      => $_POST['category_id'] ?: null,
            'description'      => $_POST['description'] ?? null,
            'serial_number'    => $_POST['serial_number'] ?? null,
            'purchase_date'    => $_POST['purchase_date'] ?: null,
            'purchase_price'   => $_POST['purchase_price'] ?: null,
            'current_value'    => $_POST['current_value'] ?: null,
            'supplier'         => $_POST['supplier'] ?? null,
            'location'         => $_POST['location'] ?? null,
            'condition_status' => $_POST['condition_status'] ?? 'good',
            'warranty_expiry'  => $_POST['warranty_expiry'] ?: null,
            'notes'            => $_POST['notes'] ?? null,
            'status'           => 'active',
            'qr_code'          => $qrCode,
        ]);

        try {
            QRCode::generate($qrCode, 'asset_' . $id, 'qr/assets');
        } catch (\Throwable $e) {
            error_log('QR generation failed: ' . $e->getMessage());
        }

        Audit::log('create', 'Inventory', 'asset', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => "Mali {$number} imesajiliwa."];
        redirect('/inventory/' . $id);
    }

    public function show(int $id): void
    {
        $this->requirePermission('inventory_view');
        $asset = Database::selectOne(
            "SELECT a.*, ac.name as category_name FROM assets a LEFT JOIN asset_categories ac ON ac.id = a.category_id WHERE a.id = ? AND a.parish_id = ? AND a.deleted_at IS NULL",
            [$id, Auth::parishId()]
        );
        if (!$asset) redirect('/inventory');

        $maintenance = $this->model->getMaintenanceLogs($id);
        $this->view('Inventory/views/show', compact('asset', 'maintenance'));
    }

    public function edit(int $id): void
    {
        $this->requirePermission('inventory_manage');
        $asset      = $this->model->findOrFail($id, Auth::parishId());
        $categories = $this->model->getCategories();
        $this->view('Inventory/views/edit', compact('asset', 'categories'));
    }

    public function update(int $id): void
    {
        $this->requirePermission('inventory_manage');
        $this->verifyCsrf();
        $this->model->findOrFail($id, Auth::parishId());

        $this->model->update($id, [
            'name'             => $_POST['name'],
            'category_id'      => $_POST['category_id'] ?: null,
            'description'      => $_POST['description'] ?? null,
            'serial_number'    => $_POST['serial_number'] ?? null,
            'purchase_date'    => $_POST['purchase_date'] ?: null,
            'purchase_price'   => $_POST['purchase_price'] ?: null,
            'current_value'    => $_POST['current_value'] ?: null,
            'supplier'         => $_POST['supplier'] ?? null,
            'location'         => $_POST['location'] ?? null,
            'condition_status' => $_POST['condition_status'] ?? 'good',
            'warranty_expiry'  => $_POST['warranty_expiry'] ?: null,
            'status'           => $_POST['status'] ?? 'active',
            'notes'            => $_POST['notes'] ?? null,
        ]);

        Audit::log('update', 'Inventory', 'asset', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Mali imesasishwa.'];
        redirect('/inventory/' . $id);
    }

    public function storeMaintenance(int $id): void
    {
        $this->requirePermission('inventory_manage');
        $this->verifyCsrf();
        $this->model->findOrFail($id, Auth::parishId());

        Database::execute(
            "INSERT INTO maintenance_logs (asset_id, parish_id, maintenance_date, type, description, cost, performed_by, next_maintenance_date, status, created_by, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,NOW())",
            [
                $id, Auth::parishId(),
                $_POST['maintenance_date'],
                $_POST['type'] ?? 'preventive',
                $_POST['description'],
                $_POST['cost'] ?? 0,
                $_POST['performed_by'] ?? null,
                $_POST['next_maintenance_date'] ?: null,
                'completed',
                Auth::id(),
            ]
        );

        // Update asset condition if provided
        if (!empty($_POST['new_condition'])) {
            $this->model->update($id, ['condition_status' => $_POST['new_condition']]);
        }

        Audit::log('maintenance', 'Inventory', 'asset', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Rekodi ya matengenezo imehifadhiwa.'];
        redirect('/inventory/' . $id);
    }

    public function qrLabel(int $id): void
    {
        $this->requirePermission('inventory_view');
        $asset = $this->model->findOrFail($id, Auth::parishId());
        $this->view('Inventory/views/qr_label', compact('asset'));
    }
}
