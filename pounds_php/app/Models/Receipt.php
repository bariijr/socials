<?php
namespace App\Models;

use App\Core\Model;

class Receipt extends Model {
    protected $table = 'receipts';
    protected $fillable = ['receiptNumber', 'loanId', 'submittedById', 'verifiedById', 'amount', 'paymentDate', 'payerName', 'payerPhone', 'paymentMethod', 'bankName', 'status', 'fileHash', 'fingerprint', 'ocrProcessed', 'rejectionReason'];
}
