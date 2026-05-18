<?php

return [
    'name'     => env('APP_NAME', 'Parokia ya Kanegeji'),
    'env'      => env('APP_ENV', 'production'),
    'debug'    => env('APP_DEBUG', false),
    'url'      => env('APP_URL', 'http://localhost'),
    'key'      => env('APP_KEY', ''),
    'timezone' => env('APP_TIMEZONE', 'Africa/Dar_es_Salaam'),
    'locale'   => env('APP_LOCALE', 'sw'),
    'locales'  => ['sw', 'en'],

    'session' => [
        'name'      => env('SESSION_NAME', 'erp_sess'),
        'lifetime'  => (int) env('SESSION_LIFETIME', 7200),
        'secure'    => filter_var(env('SESSION_SECURE', false), FILTER_VALIDATE_BOOLEAN),
        'httponly'  => true,
        'samesite'  => 'Strict',
    ],

    'upload' => [
        'max_size_mb'    => (int) env('UPLOAD_MAX_SIZE_MB', 10),
        'allowed_types'  => explode(',', env('UPLOAD_ALLOWED_TYPES', 'jpg,jpeg,png,gif,pdf,docx,xlsx')),
        'path'           => BASE_PATH . '/storage/uploads',
    ],

    'rate_limit' => [
        'login_max'    => (int) env('RATE_LIMIT_LOGIN', 5),
        'login_window' => (int) env('RATE_LIMIT_WINDOW', 900),
    ],

    'parish_id' => (int) env('PARISH_ID', 1),
    'currency'  => env('PARISH_CURRENCY', 'TZS'),
];
