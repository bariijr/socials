<?php
namespace App\Models;

use App\Core\Model;

class Notification extends Model {
    protected $table = 'notifications';
    protected $fillable = ['userId', 'type', 'channel', 'status', 'title', 'message', 'entityType', 'entityId', 'metadata', 'isRead', 'errorMessage', 'retryCount'];
}
