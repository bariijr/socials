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
                $this->call($route['handler'], $params);
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
}
