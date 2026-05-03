<?php
namespace App\Core;

class Response {
    private $statusCode = 200;
    private $headers = [];
    private $body;

    public function json($data, int $status = 200): Response {
        $this->statusCode = $status;
        $this->headers['Content-Type'] = 'application/json';
        $this->body = json_encode($data);
        return $this;
    }

    public function view(string $view, array $data = [], int $status = 200): Response {
        $this->statusCode = $status;
        $this->headers['Content-Type'] = 'text/html; charset=utf-8';
        ob_start();
        extract($data);
        require __DIR__ . "/../../app/Views/{$view}.php";
        $this->body = ob_get_clean();
        return $this;
    }

    public function download(string $filePath, string $fileName): Response {
        if (!file_exists($filePath)) {
            $this->statusCode = 404;
            return $this;
        }

        $this->statusCode = 200;
        $this->headers['Content-Type'] = 'application/octet-stream';
        $this->headers['Content-Disposition'] = "attachment; filename=\"{$fileName}\"";
        $this->headers['Content-Length'] = filesize($filePath);
        $this->body = file_get_contents($filePath);
        return $this;
    }

    public function redirect(string $url, int $status = 302): Response {
        $this->statusCode = $status;
        $this->headers['Location'] = $url;
        return $this;
    }

    public function status(int $code): Response {
        $this->statusCode = $code;
        return $this;
    }

    public function header(string $key, string $value): Response {
        $this->headers[$key] = $value;
        return $this;
    }

    public function send(): void {
        http_response_code($this->statusCode);

        foreach ($this->headers as $key => $value) {
            header("{$key}: {$value}");
        }

        if ($this->body !== null) {
            echo $this->body;
        }

        exit;
    }
}
