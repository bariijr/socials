<?php
namespace App\Models;

use App\Core\Model;

class Loan extends Model {
    protected $table = 'loans';
    protected $fillable = ['loanNumber', 'borrowerId', 'createdById', 'approvedById', 'packageId', 'status', 'principalAmount', 'interestRate', 'durationDays', 'processingFeeAmount', 'disbursedAmount', 'totalRepayable', 'totalRepaid', 'outstandingBalance', 'totalPenalties', 'dueDate', 'purpose', 'notes'];
}
