<?php
namespace App\Models;

use App\Core\Model;

class NotificationLog extends Model {
    protected $table = 'notification_logs';
    protected $fillable = ['notificationId', 'provider', 'status', 'errorMessage', 'externalId'];
}
