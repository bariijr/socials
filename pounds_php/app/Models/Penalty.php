<?php
namespace App\Models;

use App\Core\Model;

class Penalty extends Model {
    protected $table = 'penalties';
    protected $fillable = ['loanId', 'amount', 'ratePercent', 'balanceAtTime', 'weekNumber', 'notes', 'waived'];
}
