<?php
namespace App\Models;

use App\Core\Model;

class Disbursement extends Model {
    protected $table = 'disbursements';
    protected $fillable = ['loanId', 'disbursedById', 'amount', 'disbursementDate', 'paymentMethod', 'bankName', 'accountNumber', 'transactionReference', 'proofFileName', 'proofFilePath', 'proofMimeType', 'notes', 'isVerified', 'verifiedById'];
}
