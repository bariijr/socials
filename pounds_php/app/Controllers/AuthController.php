<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Services\AuthService;
use App\Core\Auth;

class AuthController extends Controller {
    private $authService;
    private $auth;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->authService = new AuthService();
        $this->auth = new Auth();
    }

    public function login() {
        $email = $this->request->getBody('email');
        $password = $this->request->getBody('password');

        if (!$email || !$password) {
            return $this->error('Email and password required', 400);
        }

        $user = $this->authService->login($email, $password);
        if (!$user) {
            return $this->error('Invalid credentials', 401);
        }

        $accessToken = $this->auth->generateToken($user);
        $refreshToken = $this->auth->generateRefreshToken($user);

        // Store session in DB
        $db = \App\Core\Database::getInstance();
        $db->insert(
            "INSERT INTO sessions (userId, token, refreshToken, ipAddress, userAgent, expiresAt) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))",
            [$user['id'], $accessToken, $refreshToken, $this->request->getIp(), $this->request->getUserAgent()]
        );

        return $this->json([
            'user' => $user,
            'accessToken' => $accessToken,
            'refreshToken' => $refreshToken
        ], 200);
    }

    public function register() {
        $data = [
            'email' => $this->request->getBody('email'),
            'password' => $this->request->getBody('password'),
            'firstName' => $this->request->getBody('firstName'),
            'lastName' => $this->request->getBody('lastName'),
            'phone' => $this->request->getBody('phone'),
        ];

        if (!$data['email'] || !$data['password'] || !$data['firstName'] || !$data['lastName']) {
            return $this->error('Missing required fields', 400);
        }

        if ($this->authService->register($data)) {
            return $this->json(['message' => 'Registration successful. Await account activation.'], 201);
        }

        return $this->error('Registration failed', 400);
    }

    public function refresh() {
        $refreshToken = $this->request->getBody('refreshToken');
        if (!$refreshToken) {
            return $this->error('Refresh token required', 400);
        }

        $decoded = $this->auth->verifyToken($refreshToken);
        if (!$decoded) {
            return $this->error('Invalid refresh token', 401);
        }

        $db = \App\Core\Database::getInstance();
        $user = $db->fetch("SELECT id, email, role FROM users WHERE id = ?", [$decoded['sub']]);

        if (!$user) {
            return $this->error('User not found', 401);
        }

        $accessToken = $this->auth->generateToken($user);
        return $this->json(['accessToken' => $accessToken], 200);
    }

    public function logout() {
        $this->requireAuth();
        $token = $this->request->getToken();

        $db = \App\Core\Database::getInstance();
        $db->update("UPDATE sessions SET isActive = 0 WHERE token = ?", [$token]);

        return $this->json(['message' => 'Logged out successfully'], 200);
    }
}
