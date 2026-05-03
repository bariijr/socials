<?php
namespace App\Models;

use App\Core\Model;

class ReceiptFile extends Model {
    protected $table = 'receipt_files';
    protected $fillable = ['receiptId', 'fileName', 'filePath', 'mimeType', 'fileSize', 'fileHash', 'isPrimary'];
}
