<?php

namespace App\Core;

class Router
{
    private array $routes = [];

    public function get(string $path, string $handler): void
    {
        $this->addRoute('GET', $path, $handler);
    }

    public function post(string $path, string $handler): void
    {
        $this->addRoute('POST', $path, $handler);
    }

    private function addRoute(string $method, string $path, string $handler): void
    {
        $pattern = preg_replace('/\{[a-z_]+\}/', '([^/]+)', $path);
        $pattern = '@^' . $pattern . '$@';

        preg_match_all('/\{([a-z_]+)\}/', $path, $paramNames);

        $this->routes[] = [
            'method'      => $method,
            'pattern'     => $pattern,
            'handler'     => $handler,
            'param_names' => $paramNames[1],
        ];
    }

    public function dispatch(string $method, string $uri): void
    {
        $uri = strtok($uri, '?');
        $uri = rtrim($uri, '/') ?: '/';

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            if (preg_match($route['pattern'], $uri, $matches)) {
                array_shift($matches);
                $params = array_combine($route['param_names'], $matches) ?: [];
                try {
                    $this->call($route['handler'], $params);
                } catch (\Throwable $e) {
                    $this->renderError($e);
                }
                return;
            }
        }

        http_response_code(404);
        require BASE_PATH . '/public_html/views/errors/404.php';
    }

    private function call(string $handler, array $params): void
    {
        [$class, $method] = explode('@', $handler);
        $fullClass = 'App\\Modules\\' . str_replace('\\', '\\', $class);

        if (!class_exists($fullClass)) {
            throw new \RuntimeException("Controller not found: {$fullClass}");
        }

        $controller = new $fullClass();
        $controller->$method(...array_values($params));
    }

    private function renderError(\Throwable $e): void
    {
        // Discard any partial output so error page renders cleanly.
        if (ob_get_level() > 0) {
            ob_end_clean();
        }

        $is503 = str_starts_with($e->getMessage(), 'db_unavailable');
        http_response_code($is503 ? 503 : 500);

        error_log('[' . date('Y-m-d H:i:s') . '] ' . get_class($e) . ': '
            . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());

        if (env('APP_DEBUG', false)) {
            echo '<pre style="background:#1e1e1e;color:#e06c75;padding:2rem;font-family:monospace;white-space:pre-wrap">';
            echo htmlspecialchars(get_class($e) . ': ' . $e->getMessage() . "\n\n" . $e->getTraceAsString());
            echo '</pre>';
            return;
        }

        $view = BASE_PATH . '/public_html/views/errors/' . ($is503 ? '503' : '500') . '.php';
        if (file_exists($view)) {
            require $view;
        } else {
            echo '<h1 style="font-family:sans-serif;text-align:center;margin-top:10vh">'
                . ($is503 ? '503 — Huduma Haipatikani' : '500 — Hitilafu ya Seva') . '</h1>';
        }
    }
}
