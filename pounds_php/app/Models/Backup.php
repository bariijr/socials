<?php
namespace App\Models;

use App\Core\Model;

class Backup extends Model {
    protected $table = 'backups';
    protected $fillable = ['type', 'status', 'fileName', 'filePath', 'fileSize', 'checksum', 'emailSent', 'sftpUploaded', 'errorMessage', 'completedAt'];
}
