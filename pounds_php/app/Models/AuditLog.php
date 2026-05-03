<?php
namespace App\Models;

use App\Core\Model;

class AuditLog extends Model {
    protected $table = 'audit_logs';
    protected $fillable = ['userId', 'userEmail', 'userRole', 'action', 'entity', 'entityId', 'oldData', 'newData', 'ipAddress', 'userAgent', 'requestPath', 'requestMethod', 'responseStatus', 'metadata'];
}
