<?php
namespace App\Models;

use App\Core\Model;

class LoanPackage extends Model {
    protected $table = 'loan_packages';
    protected $fillable = ['name', 'description', 'interestRate', 'interestFrequency', 'minAmount', 'maxAmount', 'minDuration', 'maxDuration', 'processingFeePercent', 'penaltyPercent', 'isActive'];
}
