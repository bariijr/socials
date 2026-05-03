<?php
namespace App\Core;

class Controller {
    protected $request;
    protected $response;

    public function __construct(Request $request, Response $response) {
        $this->request = $request;
        $this->response = $response;
    }

    protected function json($data, int $status = 200) {
        return $this->response->json($data, $status)->send();
    }

    protected function view(string $view, array $data = [], int $status = 200) {
        return $this->response->view($view, $data, $status)->send();
    }

    protected function redirect(string $url) {
        return $this->response->redirect($url)->send();
    }

    protected function error(string $message, int $status = 400) {
        return $this->json(['error' => $message], $status);
    }

    protected function validate(array $data, array $rules): bool {
        foreach ($rules as $field => $rule) {
            if ($rule === 'required' && empty($data[$field])) {
                $this->error("$field is required", 422);
                return false;
            }
        }
        return true;
    }

    protected function getUser() {
        return $this->request->getUser();
    }

    protected function requireAuth() {
        if (!$this->getUser()) {
            $this->error('Unauthorized', 401);
        }
    }

    protected function requireRole(...$roles) {
        $user = $this->getUser();
        if (!$user || !in_array($user['role'], $roles)) {
            $this->error('Forbidden', 403);
        }
    }
}
