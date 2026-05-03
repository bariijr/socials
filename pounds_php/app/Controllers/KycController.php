<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Database;

class KycController extends Controller {
    private $db;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->db = Database::getInstance();
    }

    public function index() {
        $this->requireAuth();

        $page = (int) $this->request->getQuery('page', 1);
        $status = $this->request->getQuery('status');
        $search = $this->request->getQuery('search');

        $sql = "SELECT k.*, u.email FROM kyc_forms k LEFT JOIN users u ON k.userId = u.id WHERE 1=1";
        $params = [];

        if ($status) {
            $sql .= " AND k.status = ?";
            $params[] = $status;
        }

        if ($search) {
            $sql .= " AND (k.fullName LIKE ? OR k.idNumber LIKE ?)";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        $sql .= " ORDER BY k.createdAt DESC LIMIT 20 OFFSET " . (($page - 1) * 20);

        $kyc = $this->db->fetchAll($sql, $params);
        return $this->json($kyc);
    }

    public function store() {
        $this->requireAuth();

        $data = $this->request->getBody();
        $kycId = $this->db->insert(
            "INSERT INTO kyc_forms (userId, fullName, phone, email, idType, idNumber, address, city, currentStep, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')",
            [$this->getUser()['id'], $data['fullName'], $data['phone'], $data['email'],
             $data['idType'], $data['idNumber'], $data['address'], $data['city'], 1]
        );

        return $this->json(['id' => $kycId], 201);
    }

    public function show($id) {
        $this->requireAuth();

        $kyc = $this->db->fetch("SELECT * FROM kyc_forms WHERE id = ?", [$id]);
        if (!$kyc) return $this->error('KYC not found', 404);

        $kyc['documents'] = $this->db->fetchAll("SELECT * FROM kyc_documents WHERE kycFormId = ?", [$id]);

        return $this->json($kyc);
    }

    public function update($id) {
        $this->requireAuth();

        $data = $this->request->getBody();
        $this->db->update(
            "UPDATE kyc_forms SET fullName = ?, phone = ?, email = ?, dateOfBirth = ?, gender = ?, idType = ?,
             idNumber = ?, address = ?, city = ?, county = ?, postalCode = ?, occupation = ?, employer = ?,
             monthlyIncome = ?, currentStep = ? WHERE id = ?",
            [$data['fullName'], $data['phone'], $data['email'], $data['dateOfBirth'], $data['gender'],
             $data['idType'], $data['idNumber'], $data['address'], $data['city'], $data['county'],
             $data['postalCode'], $data['occupation'], $data['employer'], $data['monthlyIncome'],
             $data['currentStep'], $id]
        );

        return $this->json(['message' => 'KYC updated']);
    }

    public function uploadDocument($id) {
        $this->requireAuth();

        $file = $this->request->getFile('document');
        if (!$file) return $this->error('No file uploaded', 400);

        $filePath = __DIR__ . '/../../public/uploads/kyc/' . uniqid() . '_' . basename($file['name']);
        if (!move_uploaded_file($file['tmp_name'], $filePath)) {
            return $this->error('File upload failed', 400);
        }

        $documentId = $this->db->insert(
            "INSERT INTO kyc_documents (kycFormId, documentType, fileName, filePath, mimeType, fileSize)
             VALUES (?, ?, ?, ?, ?, ?)",
            [$id, $this->request->getBody('documentType'), $file['name'], $filePath, $file['type'], $file['size']]
        );

        return $this->json(['id' => $documentId], 201);
    }

    public function submit($id) {
        $this->requireAuth();

        $this->db->update("UPDATE kyc_forms SET status = 'submitted' WHERE id = ?", [$id]);

        return $this->json(['message' => 'KYC submitted']);
    }

    public function approve($id) {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $this->db->update(
            "UPDATE kyc_forms SET status = 'approved', reviewedById = ?, reviewedAt = NOW() WHERE id = ?",
            [$this->getUser()['id'], $id]
        );

        return $this->json(['message' => 'KYC approved']);
    }

    public function reject($id) {
        $this->requireAuth();
        $this->requireRole('admin', 'super_admin');

        $notes = $this->request->getBody('notes');
        $this->db->update(
            "UPDATE kyc_forms SET status = 'rejected', reviewNotes = ?, reviewedById = ?, reviewedAt = NOW() WHERE id = ?",
            [$notes, $this->getUser()['id'], $id]
        );

        return $this->json(['message' => 'KYC rejected']);
    }

    public function generatePdf($id) {
        $this->requireAuth();

        $kyc = $this->db->fetch("SELECT * FROM kyc_forms WHERE id = ?", [$id]);
        if (!$kyc) return $this->error('KYC not found', 404);

        // Generate simple HTML for print-to-PDF
        $html = "
        <html>
        <head>
            <style>
                body { font-family: Arial; margin: 20px; }
                h1 { text-align: center; color: #1e40af; }
                .section { margin: 20px 0; padding: 10px; border-bottom: 1px solid #ccc; }
                .field { display: flex; justify-content: space-between; margin: 5px 0; }
                .label { font-weight: bold; }
                @media print { body { margin: 0; } }
            </style>
        </head>
        <body>
            <h1>KYC Application Form</h1>
            <p style='text-align: center;'>Pounds Microfinance Ltd</p>
            <p style='text-align: center;'>Form ID: {$kyc['id']}</p>

            <div class='section'>
                <h2>Personal Information</h2>
                <div class='field'><span class='label'>Full Name:</span> <span>{$kyc['fullName']}</span></div>
                <div class='field'><span class='label'>Phone:</span> <span>{$kyc['phone']}</span></div>
                <div class='field'><span class='label'>Email:</span> <span>{$kyc['email']}</span></div>
                <div class='field'><span class='label'>Date of Birth:</span> <span>{$kyc['dateOfBirth']}</span></div>
            </div>

            <div class='section'>
                <h2>Identification</h2>
                <div class='field'><span class='label'>ID Type:</span> <span>{$kyc['idType']}</span></div>
                <div class='field'><span class='label'>ID Number:</span> <span>{$kyc['idNumber']}</span></div>
            </div>

            <div class='section'>
                <h2>Address</h2>
                <div class='field'><span class='label'>Address:</span> <span>{$kyc['address']}</span></div>
                <div class='field'><span class='label'>City:</span> <span>{$kyc['city']}</span></div>
                <div class='field'><span class='label'>County:</span> <span>{$kyc['county']}</span></div>
            </div>

            <div class='section'>
                <h2>Employment</h2>
                <div class='field'><span class='label'>Occupation:</span> <span>{$kyc['occupation']}</span></div>
                <div class='field'><span class='label'>Employer:</span> <span>{$kyc['employer']}</span></div>
                <div class='field'><span class='label'>Monthly Income:</span> <span>{$kyc['monthlyIncome']}</span></div>
            </div>

            <p style='text-align: center; margin-top: 40px; font-size: 12px;'>
                Generated on " . date('Y-m-d H:i:s') . "
            </p>
        </body>
        </html>";

        return $this->response->json(['html' => $html], 200)->send();
    }
}
