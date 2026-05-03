<?php
namespace App\Models;

use App\Core\Model;

class Setting extends Model {
    protected $table = 'settings';
    protected $fillable = ['key', 'value', 'type', 'description', 'isPublic'];
}
