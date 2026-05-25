<?php

return [
    'host'    => env('DB_HOST', 'localhost'),
    'port'    => (int) env('DB_PORT', 3306),
    'dbname'  => env('DB_NAME', ''),
    'user'    => env('DB_USER', ''),
    'pass'    => env('DB_PASS', ''),
    'charset' => env('DB_CHARSET', 'utf8mb4'),
    'options' => [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone='+03:00'",
    ],
];
