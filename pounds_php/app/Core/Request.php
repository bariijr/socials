<?php
namespace App\Core;

class Request {
    private $method;
    private $path;
    private $query;
    private $body;
    private $headers;
    private $user;

    public function __construct() {
        $this->method = $_SERVER['REQUEST_METHOD'];
        $this->path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $this->query = $_GET;
        $this->headers = getallheaders();
        $this->parseBody();
    }

    private function parseBody(): void {
        $input = file_get_contents('php://input');
        if ($this->method !== 'GET' && !empty($input)) {
            $contentType = $this->headers['Content-Type'] ?? '';
            if (strpos($contentType, 'application/json') !== false) {
                $this->body = json_decode($input, true) ?? [];
            } else {
                $this->body = $_POST;
            }
        } else {
            $this->body = $_POST;
        }
    }

    public function getMethod(): string {
        return $this->method;
    }

    public function getPath(): string {
        return $this->path;
    }

    public function getQuery(string $key = null, $default = null) {
        if ($key === null) return $this->query;
        return $this->query[$key] ?? $default;
    }

    public function getBody(string $key = null, $default = null) {
        if ($key === null) return $this->body;
        return $this->body[$key] ?? $default;
    }

    public function getHeader(string $key) {
        return $this->headers[$key] ?? null;
    }

    public function getToken(): ?string {
        $auth = $this->headers['Authorization'] ?? '';
        if (preg_match('/Bearer\s+(.+)/', $auth, $matches)) {
            return $matches[1];
        }
        return null;
    }

    public function getFile(string $key): ?array {
        return $_FILES[$key] ?? null;
    }

    public function setUser($user): void {
        $this->user = $user;
    }

    public function getUser() {
        return $this->user;
    }

    public function getIp(): string {
        return $_SERVER['REMOTE_ADDR'] ?? '';
    }

    public function getUserAgent(): string {
        return $_SERVER['HTTP_USER_AGENT'] ?? '';
    }
}
