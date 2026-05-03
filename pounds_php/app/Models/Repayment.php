<?php
namespace App\Models;

use App\Core\Model;

class Repayment extends Model {
    protected $table = 'repayments';
    protected $fillable = ['loanId', 'amount', 'principalPortion', 'interestPortion', 'penaltyPortion', 'balanceAfter', 'status', 'paymentDate', 'paymentMethod', 'notes'];
}
