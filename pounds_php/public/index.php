<?php
// Front controller
define('BASE_PATH', dirname(dirname(__FILE__)));

// Load .env file
require_once BASE_PATH . '/app/Helpers/bootstrap.php';
loadEnv(BASE_PATH . '/.env');

// Enable error reporting for debugging
if (getenv('APP_DEBUG') === 'true') {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
} else {
    error_reporting(0);
    ini_set('display_errors', 0);
}

// Set default timezone
date_default_timezone_set('UTC');

// Autoloader (simple PSR-4)
spl_autoload_register(function ($class) {
    $prefix = 'App\\';
    $baseDir = BASE_PATH . '/app/';

    if (strpos($class, $prefix) === 0) {
        $relativeClass = substr($class, strlen($prefix));
        $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

        if (file_exists($file)) {
            require $file;
        }
    }
});

// Initialize app
try {
    $request = new App\Core\Request();
    $response = new App\Core\Response();
    $router = new App\Core\Router($request, $response);
    $router->dispatch();
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Internal server error',
        'message' => getenv('APP_DEBUG') === 'true' ? $e->getMessage() : null,
    ]);
    exit;
}
