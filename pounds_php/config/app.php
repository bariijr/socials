<?php
return [
    'app_name' => $_ENV['APP_NAME'] ?? 'Pounds Microfinance',
    'app_url' => $_ENV['APP_URL'] ?? 'https://pounds.insider.co.tz',
    'app_env' => $_ENV['APP_ENV'] ?? 'production',
    'app_debug' => $_ENV['APP_DEBUG'] ?? false,
    'jwt_secret' => $_ENV['JWT_SECRET'] ?? '',
    'jwt_expires_in' => 15 * 60, // 15 minutes
    'jwt_refresh_expires_in' => 7 * 24 * 60 * 60, // 7 days
];
