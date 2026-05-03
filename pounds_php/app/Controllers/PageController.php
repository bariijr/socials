<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;

class PageController extends Controller {
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->db = Database::getInstance();
    }

    public function index() {
        return $this->redirect('/login');
    }

    public function login() {
        // If already has token cookie, let the page JS handle redirect
        return $this->view('auth/login', ['title' => 'Login — Pounds MFI']);
    }

    public function dashboard() {
        return $this->view('dashboard/index', ['title' => 'Dashboard — Pounds MFI', 'page' => 'dashboard']);
    }

    public function loans() {
        return $this->view('loans/index', ['title' => 'Loans — Pounds MFI', 'page' => 'loans']);
    }

    public function kyc() {
        return $this->view('kyc/index', ['title' => 'KYC — Pounds MFI', 'page' => 'kyc']);
    }

    public function receipts() {
        return $this->view('receipts/index', ['title' => 'Receipts — Pounds MFI', 'page' => 'receipts']);
    }

    public function users() {
        return $this->view('users/index', ['title' => 'Users — Pounds MFI', 'page' => 'users']);
    }
}
