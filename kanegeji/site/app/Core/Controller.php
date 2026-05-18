<?php

namespace App\Core;

abstract class Controller
{
    protected function view(string $view, array $data = [], string $layout = 'main'): void
    {
        extract($data);

        // Resolve view path: Module/views/... or public_html/views/...
        $parts     = explode('/', $view);
        $module    = count($parts) > 1 ? array_shift($parts) : null;
        $viewFile  = implode('/', $parts);

        if ($module) {
            $viewPath = BASE_PATH . "/modules/{$module}/views/{$viewFile}.php";
        } else {
            $viewPath = BASE_PATH . "/public_html/views/{$viewFile}.php";
        }

        if (!file_exists($viewPath)) {
            throw new \RuntimeException("View not found: {$viewPath}");
        }

        // Capture view output
        ob_start();
        require $viewPath;
        $content = ob_get_clean();

        // Render layout
        $layoutPath = BASE_PATH . "/public_html/views/layouts/{$layout}.php";
        if (file_exists($layoutPath)) {
            require $layoutPath;
        } else {
            echo $content;
        }
    }

    protected function json(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    protected function redirect(string $url, int $status = 302): never
    {
        http_response_code($status);
        header("Location: {$url}");
        exit;
    }

    protected function requireAuth(): void
    {
        Auth::requireLogin();
    }

    protected function requirePermission(string $perm): void
    {
        Auth::requirePermission($perm);
    }

    protected function verifyCsrf(): void
    {
        CSRF::verify();
    }

    protected function paginate(array $data, int $total, int $perPage, int $page): array
    {
        return [
            'data'         => $data,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int) ceil($total / $perPage),
            'from'         => ($page - 1) * $perPage + 1,
            'to'           => min($page * $perPage, $total),
        ];
    }

    protected function validate(array $data, array $rules): array
    {
        $errors = [];
        foreach ($rules as $field => $rule) {
            $ruleList = explode('|', $rule);
            foreach ($ruleList as $r) {
                $val = $data[$field] ?? null;
                if ($r === 'required' && empty($val) && $val !== '0') {
                    $errors[$field][] = __('common.required_field', 'This field is required');
                }
                if (str_starts_with($r, 'max:')) {
                    $max = (int) substr($r, 4);
                    if (strlen((string) $val) > $max) {
                        $errors[$field][] = "Maximum {$max} characters";
                    }
                }
                if ($r === 'email' && !empty($val) && !filter_var($val, FILTER_VALIDATE_EMAIL)) {
                    $errors[$field][] = 'Invalid email address';
                }
                if ($r === 'numeric' && !empty($val) && !is_numeric($val)) {
                    $errors[$field][] = 'Must be a number';
                }
            }
        }
        return $errors;
    }
}
