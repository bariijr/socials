<?php
namespace App\Models;

use App\Core\Model;

class Session extends Model {
    protected $table = 'sessions';
    protected $fillable = ['userId', 'token', 'refreshToken', 'ipAddress', 'userAgent', 'deviceFingerprint', 'expiresAt', 'isActive'];
}
