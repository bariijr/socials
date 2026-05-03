<?php
namespace App\Models;

use App\Core\Model;

class User extends Model {
    protected $table = 'users';
    protected $fillable = ['email', 'password', 'firstName', 'lastName', 'phone', 'role', 'status', 'language', 'profilePhoto', 'nationalId', 'address'];

    public function getByEmail(string $email): ?array {
        return $this->where('email', $email)->first();
    }

    public function getActive() {
        return $this->where('status', 'active')->get();
    }

    public function loans() {
        $db = $this->db;
        return $db->fetchAll("SELECT * FROM loans WHERE borrowerId = ?", [$this->id]);
    }
}
