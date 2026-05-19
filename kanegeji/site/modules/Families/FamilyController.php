<?php

namespace App\Modules\Families;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;

class FamilyController extends Controller
{
    private FamilyModel $model;

    public function __construct()
    {
        $this->requireAuth();
        $this->model = new FamilyModel();
    }

    public function index(): void
    {
        $this->requirePermission('members.view');
        $filters     = $_GET;
        $page        = max(1, (int) ($_GET['page'] ?? 1));
        $data        = $this->model->search($filters, $page);
        $communities = Database::select("SELECT id, name FROM communities WHERE parish_id = ? ORDER BY name", [Auth::parishId()]);
        $this->view('Families/views/index', array_merge($data, compact('communities')));
    }

    public function create(): void
    {
        $this->requirePermission('members.create');
        $communities = Database::select("SELECT id, name FROM communities WHERE parish_id = ? ORDER BY name", [Auth::parishId()]);
        $this->view('Families/views/create', compact('communities'));
    }

    public function store(): void
    {
        $this->requirePermission('members.create');
        $this->verifyCsrf();

        $id = $this->model->create([
            'parish_id'    => Auth::parishId(),
            'family_name'  => $_POST['family_name'],
            'community_id' => $_POST['community_id'] ?: null,
            'address'      => $_POST['address'] ?? null,
        ]);

        Audit::log('create', 'Families', 'family', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Familia imeundwa.'];
        redirect('/families/' . $id);
    }

    public function show(int $id): void
    {
        $this->requirePermission('members.view');
        $family  = $this->model->findOrFail($id, Auth::parishId());
        $members = $this->model->getMembers($id);
        $community = $family['community_id']
            ? Database::selectOne("SELECT name FROM communities WHERE id = ?", [$family['community_id']])
            : null;
        $this->view('Families/views/show', compact('family', 'members', 'community'));
    }

    public function edit(int $id): void
    {
        $this->requirePermission('members.edit');
        $family      = $this->model->findOrFail($id, Auth::parishId());
        $communities = Database::select("SELECT id, name FROM communities WHERE parish_id = ? ORDER BY name", [Auth::parishId()]);
        $this->view('Families/views/edit', compact('family', 'communities'));
    }

    public function update(int $id): void
    {
        $this->requirePermission('members.edit');
        $this->verifyCsrf();
        $this->model->findOrFail($id, Auth::parishId());

        $this->model->update($id, [
            'family_name'  => $_POST['family_name'],
            'community_id' => $_POST['community_id'] ?: null,
            'address'      => $_POST['address'] ?? null,
        ]);

        Audit::log('update', 'Families', 'family', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Familia imesasishwa.'];
        redirect('/families/' . $id);
    }
}
