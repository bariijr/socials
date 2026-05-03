<?php
namespace App\Models;

use App\Core\Model;

class KycForm extends Model {
    protected $table = 'kyc_forms';
    protected $fillable = ['userId', 'status', 'currentStep', 'fullName', 'phone', 'email', 'dateOfBirth', 'gender', 'idType', 'idNumber', 'idIssuedDate', 'idExpiryDate', 'address', 'city', 'county', 'postalCode', 'occupation', 'employer', 'monthlyIncome', 'isLead', 'leadSource'];
}
