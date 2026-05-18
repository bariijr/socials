<?php

namespace App\Modules\Documents;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Audit;

class DocumentController extends Controller
{
    private DocumentModel $model;

    public function __construct()
    {
        $this->requireAuth();
        $this->model = new DocumentModel();
    }

    public function index(): void
    {
        $this->requirePermission('documents_view');
        $filters    = $_GET;
        $page       = max(1, (int) ($_GET['page'] ?? 1));
        $data       = $this->model->search($filters, $page);
        $categories = $this->model->getCategories();
        $this->view('Documents/views/index', array_merge($data, compact('categories')));
    }

    public function create(): void
    {
        $this->requirePermission('documents_manage');
        $categories = $this->model->getCategories();
        $this->view('Documents/views/create', compact('categories'));
    }

    public function store(): void
    {
        $this->requirePermission('documents_manage');
        $this->verifyCsrf();

        if (empty($_FILES['file']['tmp_name'])) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Tafadhali chagua faili.'];
            redirect('/documents/create');
        }

        $file     = $_FILES['file'];
        $origName = basename($file['name']);
        $ext      = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        $allowed  = ['pdf','doc','docx','xls','xlsx','ppt','pptx','jpg','jpeg','png','txt'];

        if (!in_array($ext, $allowed)) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Aina ya faili hairuhusiwi.'];
            redirect('/documents/create');
        }

        if ($file['size'] > 20 * 1024 * 1024) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Faili ni kubwa sana (max 20MB).'];
            redirect('/documents/create');
        }

        $uploadDir = BASE_PATH . '/storage/uploads/documents/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $newName = date('YmdHis') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], $uploadDir . $newName)) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Imeshindwa kupakia faili.'];
            redirect('/documents/create');
        }

        $id = $this->model->create([
            'parish_id'   => Auth::parishId(),
            'title'       => $_POST['title'],
            'description' => $_POST['description'] ?? null,
            'category_id' => $_POST['category_id'] ?: null,
            'file_path'   => 'uploads/documents/' . $newName,
            'file_name'   => $origName,
            'file_size'   => $file['size'],
            'file_type'   => $ext,
            'uploaded_by' => Auth::id(),
            'is_public'   => !empty($_POST['is_public']) ? 1 : 0,
        ]);

        Audit::log('upload', 'Documents', 'document', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Hati imepakiwa.'];
        redirect('/documents');
    }

    public function show(int $id): void
    {
        $this->requirePermission('documents_view');
        $doc = $this->model->findOrFail($id, Auth::parishId());
        $this->view('Documents/views/show', compact('doc'));
    }

    public function download(int $id): void
    {
        $this->requirePermission('documents_view');
        $doc  = $this->model->findOrFail($id, Auth::parishId());
        $path = BASE_PATH . '/storage/' . $doc['file_path'];

        if (!file_exists($path)) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Faili haipatikani.'];
            redirect('/documents');
        }

        Audit::log('download', 'Documents', 'document', $id);
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $doc['file_name'] . '"');
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }

    public function destroy(int $id): void
    {
        $this->requirePermission('documents_manage');
        $this->verifyCsrf();
        $doc  = $this->model->findOrFail($id, Auth::parishId());
        $path = BASE_PATH . '/storage/' . $doc['file_path'];

        $this->model->softDelete($id);
        if (file_exists($path)) @unlink($path);

        Audit::log('delete', 'Documents', 'document', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Hati imefutwa.'];
        redirect('/documents');
    }
}
