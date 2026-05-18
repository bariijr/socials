<?php

use App\Core\Router;

/** @var Router $router */

// ── AUTH ───────────────────────────────────────────────────
$router->get('/login',   'Auth\AuthController@showLogin');
$router->post('/login',  'Auth\AuthController@login');
$router->get('/logout',  'Auth\AuthController@logout');
$router->get('/forgot-password',  'Auth\AuthController@showForgot');
$router->post('/forgot-password', 'Auth\AuthController@sendReset');
$router->get('/reset-password',   'Auth\AuthController@showReset');
$router->post('/reset-password',  'Auth\AuthController@resetPassword');

// ── DASHBOARD ──────────────────────────────────────────────
$router->get('/',          'Dashboard\DashboardController@index');
$router->get('/dashboard', 'Dashboard\DashboardController@index');

// ── MEMBERS ────────────────────────────────────────────────
$router->get('/members',             'Members\MemberController@index');
$router->get('/members/create',      'Members\MemberController@create');
$router->post('/members',            'Members\MemberController@store');
$router->get('/members/{id}',        'Members\MemberController@show');
$router->get('/members/{id}/edit',   'Members\MemberController@edit');
$router->post('/members/{id}',       'Members\MemberController@update');
$router->post('/members/{id}/delete','Members\MemberController@destroy');
$router->get('/members/{id}/card',   'Members\MemberController@memberCard');

// ── JUMUIYA ────────────────────────────────────────────────
$router->get('/jumuiya',              'Jumuiya\JumuiyaController@index');
$router->get('/jumuiya/create',       'Jumuiya\JumuiyaController@create');
$router->post('/jumuiya',             'Jumuiya\JumuiyaController@store');
$router->get('/jumuiya/{id}',         'Jumuiya\JumuiyaController@show');
$router->get('/jumuiya/{id}/edit',    'Jumuiya\JumuiyaController@edit');
$router->post('/jumuiya/{id}',        'Jumuiya\JumuiyaController@update');
$router->post('/jumuiya/{id}/delete', 'Jumuiya\JumuiyaController@destroy');

// ── ACCOUNTING ─────────────────────────────────────────────
$router->get('/accounting',                       'Accounting\AccountingController@index');
$router->get('/accounting/transactions',          'Accounting\AccountingController@transactions');
$router->get('/accounting/transactions/create',   'Accounting\AccountingController@createTransaction');
$router->post('/accounting/transactions',         'Accounting\AccountingController@storeTransaction');
$router->get('/accounting/transactions/{id}',     'Accounting\AccountingController@showTransaction');
$router->get('/accounting/transactions/{id}/edit','Accounting\AccountingController@editTransaction');
$router->post('/accounting/transactions/{id}',    'Accounting\AccountingController@updateTransaction');
$router->post('/accounting/transactions/{id}/delete', 'Accounting\AccountingController@destroyTransaction');
$router->post('/accounting/transactions/{id}/approve', 'Accounting\AccountingController@approveTransaction');
$router->get('/accounting/receipts/{id}',         'Accounting\AccountingController@receipt');
$router->get('/accounting/budgets',               'Accounting\AccountingController@budgets');
$router->get('/accounting/chart-of-accounts',     'Accounting\AccountingController@chartOfAccounts');
$router->get('/accounting/reconciliation',        'Accounting\AccountingController@reconciliation');

// ── CAMPAIGNS ──────────────────────────────────────────────
$router->get('/campaigns',             'Accounting\AccountingController@campaigns');
$router->get('/campaigns/create',      'Accounting\AccountingController@createCampaign');
$router->post('/campaigns',            'Accounting\AccountingController@storeCampaign');
$router->get('/campaigns/{id}',        'Accounting\AccountingController@showCampaign');

// ── REPORTS ────────────────────────────────────────────────
$router->get('/reports',              'Reports\ReportController@index');
$router->get('/reports/income',       'Reports\ReportController@income');
$router->get('/reports/expenses',     'Reports\ReportController@expenses');
$router->get('/reports/members',      'Reports\ReportController@members');
$router->get('/reports/jumuiya',      'Reports\ReportController@jumuiya');
$router->post('/reports/export',      'Reports\ReportController@export');

// ── USERS ──────────────────────────────────────────────────
$router->get('/users',             'Users\UserController@index');
$router->get('/users/create',      'Users\UserController@create');
$router->post('/users',            'Users\UserController@store');
$router->get('/users/{id}/edit',   'Users\UserController@edit');
$router->post('/users/{id}',       'Users\UserController@update');
$router->post('/users/{id}/delete','Users\UserController@destroy');

// ── AUDIT ──────────────────────────────────────────────────
$router->get('/audit',         'Audit\AuditController@index');
$router->get('/audit/logins',  'Audit\AuditController@logins');

// ── SETTINGS ───────────────────────────────────────────────
$router->get('/settings',        'Settings\SettingsController@index');
$router->post('/settings',       'Settings\SettingsController@update');
$router->get('/settings/profile','Settings\SettingsController@profile');
$router->post('/settings/profile','Settings\SettingsController@updateProfile');

// ── QR VERIFICATION (public) ───────────────────────────────
$router->get('/verify/{code}', 'Auth\AuthController@verify');
