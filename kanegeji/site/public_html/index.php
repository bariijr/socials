<?php

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));

// ── Autoloader ─────────────────────────────────────────────
require BASE_PATH . '/vendor/autoload.php';

// ── Environment ────────────────────────────────────────────
$dotenv = Dotenv\Dotenv::createImmutable(BASE_PATH);
$dotenv->safeLoad();

// ── Timezone & charset ─────────────────────────────────────
date_default_timezone_set(env('APP_TIMEZONE', 'Africa/Dar_es_Salaam'));
header('Content-Type: text/html; charset=UTF-8');

// ── Error handling ─────────────────────────────────────────
if (env('APP_DEBUG', false)) {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    ini_set('error_log', BASE_PATH . '/storage/logs/php_errors.log');
    error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
}

// ── Session ────────────────────────────────────────────────
use App\Core\{Auth, Lang, Request, Router, Session};

Session::start();

// ── Language ───────────────────────────────────────────────
$locale = Session::get('locale')
    ?? Auth::user()['lang']
    ?? env('APP_LOCALE', 'sw');
Lang::load($locale);

// ── Router ─────────────────────────────────────────────────
$router = new Router();
require BASE_PATH . '/config/routes.php';

$router->dispatch(Request::method(), Request::uri());
