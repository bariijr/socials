<?php
namespace App\Core;

class Router {
    private $routes = [];
    private $request;
    private $response;
    private $middlewares = [];

    public function __construct(Request $request, Response $response) {
        $this->request = $request;
        $this->response = $response;
        $this->loadRoutes();
    }

    private function loadRoutes(): void {
        $this->routes = [
            // Auth routes
            'POST /api/auth/login' => 'AuthController@login',
            'POST /api/auth/register' => 'AuthController@register',
            'POST /api/auth/logout' => 'AuthController@logout',
            'POST /api/auth/refresh' => 'AuthController@refresh',

            // Dashboard
            'GET /api/dashboard/kpis' => 'DashboardController@kpis',
            'GET /api/dashboard/trend' => 'DashboardController@trend',
            'GET /api/dashboard/breakdown' => 'DashboardController@breakdown',
            'GET /api/dashboard/activity' => 'DashboardController@activity',

            // Loans
            'GET /api/loans' => 'LoanController@index',
            'POST /api/loans' => 'LoanController@store',
            'GET /api/loans/:id' => 'LoanController@show',
            'PUT /api/loans/:id' => 'LoanController@update',
            'POST /api/loans/:id/submit' => 'LoanController@submit',
            'POST /api/loans/:id/approve' => 'LoanController@approve',
            'POST /api/loans/:id/reject' => 'LoanController@reject',
            'POST /api/loans/:id/disburse' => 'LoanController@disburse',
            'GET /api/loans/:id/lock' => 'LoanController@acquireLock',
            'DELETE /api/loans/:id/lock' => 'LoanController@releaseLock',

            // KYC
            'GET /api/kyc' => 'KycController@index',
            'POST /api/kyc' => 'KycController@store',
            'GET /api/kyc/:id' => 'KycController@show',
            'PUT /api/kyc/:id' => 'KycController@update',
            'POST /api/kyc/:id/submit' => 'KycController@submit',
            'POST /api/kyc/:id/approve' => 'KycController@approve',
            'POST /api/kyc/:id/reject' => 'KycController@reject',
            'POST /api/kyc/:id/document' => 'KycController@uploadDocument',
            'GET /api/kyc/:id/pdf' => 'KycController@generatePdf',

            // Receipts
            'GET /api/receipts' => 'ReceiptController@index',
            'POST /api/receipts' => 'ReceiptController@store',
            'GET /api/receipts/:id' => 'ReceiptController@show',
            'POST /api/receipts/:id/verify' => 'ReceiptController@verify',
            'POST /api/receipts/:id/reject' => 'ReceiptController@reject',

            // Repayments
            'POST /api/repayments' => 'RepaymentController@store',
            'GET /api/loans/:id/repayments' => 'RepaymentController@index',

            // Disbursements
            'GET /api/disbursements' => 'DisbursementController@index',
            'POST /api/disbursements' => 'DisbursementController@store',
            'GET /api/disbursements/:id' => 'DisbursementController@show',

            // Users
            'GET /api/users' => 'UserController@index',
            'GET /api/users/:id' => 'UserController@show',
            'PUT /api/users/:id' => 'UserController@update',
            'GET /api/users/:id/profile' => 'UserController@profile',

            // Notifications
            'GET /api/notifications' => 'NotificationController@index',
            'PUT /api/notifications/:id/read' => 'NotificationController@markRead',
            'PUT /api/notifications/read-all' => 'NotificationController@markAllRead',

            // Settings
            'GET /api/settings' => 'SettingsController@index',
            'POST /api/settings' => 'SettingsController@store',
            'GET /api/settings/:key' => 'SettingsController@show',

            // Audit logs
            'GET /api/audit' => 'AuditController@index',

            // Loan packages
            'GET /api/loan-packages' => 'LoanController@getPackages',
            'POST /api/loan-packages' => 'LoanController@storePackage',
            'PUT /api/loan-packages/:id' => 'LoanController@updatePackage',

            // Cron jobs
            'GET /cron/penalties' => 'CronController@penalties',
            'GET /cron/retry-notifications' => 'CronController@retryNotifications',

            // Web pages
            'GET /' => 'PageController@index',
            'GET /login' => 'PageController@login',
            'GET /dashboard' => 'PageController@dashboard',
            'GET /loans' => 'PageController@loans',
            'GET /kyc' => 'PageController@kyc',
            'GET /receipts' => 'PageController@receipts',
            'GET /users' => 'PageController@users',
        ];
    }

    public function dispatch(): void {
        $method = $this->request->getMethod();
        $path = parse_url($this->request->getPath(), PHP_URL_PATH);

        // Try exact match first
        $key = "$method $path";
        if (isset($this->routes[$key])) {
            $this->executeRoute($this->routes[$key]);
            return;
        }

        // Try pattern matching for routes with :id or other params
        foreach ($this->routes as $pattern => $handler) {
            if ($this->matchRoute($pattern, $method, $path, $matches)) {
                $this->executeRoute($handler, $matches);
                return;
            }
        }

        $this->response->json(['error' => 'Route not found'], 404)->send();
    }

    private function matchRoute(string $pattern, string $method, string $path, &$matches = []): bool {
        $parts = explode(' ', $pattern);
        if (count($parts) !== 2) return false;

        list($patternMethod, $patternPath) = $parts;
        if ($patternMethod !== $method) return false;

        $regex = str_replace('/', '\/', $patternPath);
        $regex = preg_replace('/:[a-zA-Z_][a-zA-Z0-9_]*/', '([^/]+)', $regex);
        $regex = "/^{$regex}$/";

        if (preg_match($regex, $path, $matches)) {
            array_shift($matches);
            return true;
        }

        return false;
    }

    private function executeRoute(string $handler, array $params = []): void {
        list($controller, $method) = explode('@', $handler);
        $controllerClass = "App\\Controllers\\{$controller}";

        if (!class_exists($controllerClass)) {
            $this->response->json(['error' => 'Controller not found'], 500)->send();
        }

        $instance = new $controllerClass($this->request, $this->response);

        // Apply middlewares
        $this->applyMiddlewares($instance);

        if (!method_exists($instance, $method)) {
            $this->response->json(['error' => 'Method not found'], 500)->send();
        }

        call_user_func_array([$instance, $method], $params);
    }

    private function applyMiddlewares($controller): void {
        // Auth middleware
        $route = $this->request->getMethod() . ' ' . parse_url($this->request->getPath(), PHP_URL_PATH);

        // Skip auth for public routes
        $publicRoutes = [
            'POST /api/auth/login', 'POST /api/auth/register',
            'GET /login', 'GET /',
            'GET /dashboard', 'GET /loans', 'GET /kyc', 'GET /receipts', 'GET /users',
            'GET /cron/penalties', 'GET /cron/retry-notifications',
        ];

        if (!in_array($route, $publicRoutes)) {
            $auth = new Auth();
            $token = $this->request->getToken();

            if (!$token) {
                $this->response->json(['error' => 'Unauthorized'], 401)->send();
            }

            $decoded = $auth->verifyToken($token);
            if (!$decoded) {
                $this->response->json(['error' => 'Invalid token'], 401)->send();
            }

            // Get user from database
            $db = Database::getInstance();
            $user = $db->fetch("SELECT id, email, role FROM users WHERE id = ?", [$decoded['sub']]);

            if (!$user) {
                $this->response->json(['error' => 'User not found'], 401)->send();
            }

            $this->request->setUser($user);
        }
    }
}
