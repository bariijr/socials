<?php
namespace App\Models;

use App\Core\Model;

class KycDocument extends Model {
    protected $table = 'kyc_documents';
    protected $fillable = ['kycFormId', 'documentType', 'fileName', 'filePath', 'mimeType', 'fileSize', 'fileHash', 'ocrResult', 'ocrProcessed'];
}
