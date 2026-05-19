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

// ── PAYROLL ────────────────────────────────────────────────
$router->get('/payroll/runs',                   'Payroll\PayrollController@runs');
$router->get('/payroll/runs/create',            'Payroll\PayrollController@createRun');
$router->post('/payroll/runs',                  'Payroll\PayrollController@storeRun');
$router->get('/payroll/runs/{id}',              'Payroll\PayrollController@showRun');
$router->post('/payroll/runs/{id}/approve',     'Payroll\PayrollController@approveRun');
$router->get('/payroll/payslip/{id}',           'Payroll\PayrollController@payslip');
$router->get('/payroll/employees',              'Payroll\PayrollController@employees');
$router->get('/payroll/employees/create',       'Payroll\PayrollController@createEmployee');
$router->post('/payroll/employees',             'Payroll\PayrollController@storeEmployee');
$router->get('/payroll/employees/{id}',         'Payroll\PayrollController@showEmployee');
$router->get('/payroll/employees/{id}/edit',    'Payroll\PayrollController@editEmployee');
$router->post('/payroll/employees/{id}',        'Payroll\PayrollController@updateEmployee');

// ── INVENTORY ──────────────────────────────────────────────
$router->get('/inventory',                      'Inventory\InventoryController@index');
$router->get('/inventory/create',               'Inventory\InventoryController@create');
$router->post('/inventory',                     'Inventory\InventoryController@store');
$router->get('/inventory/{id}',                 'Inventory\InventoryController@show');
$router->get('/inventory/{id}/edit',            'Inventory\InventoryController@edit');
$router->post('/inventory/{id}',                'Inventory\InventoryController@update');
$router->post('/inventory/{id}/maintenance',    'Inventory\InventoryController@storeMaintenance');
$router->get('/inventory/{id}/qr',              'Inventory\InventoryController@qrLabel');

// ── DOCUMENTS ──────────────────────────────────────────────
$router->get('/documents',                      'Documents\DocumentController@index');
$router->get('/documents/create',               'Documents\DocumentController@create');
$router->post('/documents',                     'Documents\DocumentController@store');
$router->get('/documents/{id}',                 'Documents\DocumentController@show');
$router->get('/documents/{id}/download',        'Documents\DocumentController@download');
$router->post('/documents/{id}/delete',         'Documents\DocumentController@destroy');

// ── EVENTS ─────────────────────────────────────────────────
$router->get('/events',                         'Events\EventController@index');
$router->get('/events/verify',                  'Events\EventController@verifyTicket');
$router->post('/events/ticket/mark-used',       'Events\EventController@markUsed');
$router->get('/events/create',                  'Events\EventController@create');
$router->post('/events',                        'Events\EventController@store');
$router->get('/events/{id}',                    'Events\EventController@show');
$router->get('/events/{id}/edit',               'Events\EventController@edit');
$router->post('/events/{id}',                   'Events\EventController@update');
$router->post('/events/{id}/tickets',           'Events\EventController@issueTicket');

// ── BOOKINGS ───────────────────────────────────────────────
$router->get('/bookings',                       'Bookings\BookingController@index');
$router->get('/bookings/create',                'Bookings\BookingController@create');
$router->post('/bookings',                      'Bookings\BookingController@store');
$router->get('/bookings/{id}',                  'Bookings\BookingController@show');
$router->post('/bookings/{id}/approve',         'Bookings\BookingController@approve');
$router->post('/bookings/{id}/reject',          'Bookings\BookingController@reject');
$router->post('/bookings/{id}/payment',         'Bookings\BookingController@updatePayment');

// ── FAMILIES ───────────────────────────────────────────────
$router->get('/families',              'Families\FamilyController@index');
$router->get('/families/create',       'Families\FamilyController@create');
$router->post('/families',             'Families\FamilyController@store');
$router->get('/families/{id}',         'Families\FamilyController@show');
$router->get('/families/{id}/edit',    'Families\FamilyController@edit');
$router->post('/families/{id}',        'Families\FamilyController@update');

// ── SACRAMENTS ─────────────────────────────────────────────
$router->get('/sacraments',              'Sacraments\SacramentController@index');
$router->get('/sacraments/create',       'Sacraments\SacramentController@create');
$router->post('/sacraments',             'Sacraments\SacramentController@store');
$router->post('/sacraments/{id}/delete', 'Sacraments\SacramentController@destroy');

// ── PLEDGES ────────────────────────────────────────────────
$router->get('/pledges',                 'Pledges\PledgeController@index');
$router->get('/pledges/create',          'Pledges\PledgeController@create');
$router->post('/pledges',                'Pledges\PledgeController@store');
$router->get('/pledges/{id}',            'Pledges\PledgeController@show');
$router->post('/pledges/{id}/payment',   'Pledges\PledgeController@recordPayment');

// ── RECONCILIATION ─────────────────────────────────────────
$router->get('/reconciliation',                        'Reconciliation\ReconciliationController@index');
$router->post('/reconciliation/import',                'Reconciliation\ReconciliationController@import');
$router->post('/reconciliation/match',                 'Reconciliation\ReconciliationController@match');
$router->post('/reconciliation/auto-match',            'Reconciliation\ReconciliationController@autoMatch');
$router->post('/reconciliation/reconcile',             'Reconciliation\ReconciliationController@reconcile');
$router->post('/reconciliation/delete',                'Reconciliation\ReconciliationController@deleteItem');
$router->get('/reconciliation/search-transactions',    'Reconciliation\ReconciliationController@searchTransactions');

// ── NOTIFICATIONS (bulk broadcast) ─────────────────────────
$router->get('/notifications',         'Notifications\NotificationController@index');
$router->get('/notifications/create',  'Notifications\NotificationController@create');
$router->post('/notifications',        'Notifications\NotificationController@store');

// ── ADMIN (super_admin only) ────────────────────────────────
$router->get('/admin',                               'Admin\AdminController@index');
$router->get('/admin/parishes',                      'Admin\AdminController@parishes');
$router->get('/admin/parishes/create',               'Admin\AdminController@createParish');
$router->post('/admin/parishes',                     'Admin\AdminController@storeParish');
$router->get('/admin/parishes/{id}',                 'Admin\AdminController@showParish');
$router->post('/admin/parishes/{id}/toggle',         'Admin\AdminController@toggleParish');
$router->get('/admin/applications',                  'Admin\AdminController@applications');
$router->post('/admin/applications/{id}/approve',    'Admin\AdminController@approveApplication');
$router->post('/admin/applications/{id}/reject',     'Admin\AdminController@rejectApplication');

// ── AI CHAT ────────────────────────────────────────────────
$router->get('/ai',                              'AI\AIController@index');
$router->post('/ai/ask',                         'AI\AIController@ask');
$router->post('/ai/conversations/{id}/delete',   'AI\AIController@deleteConversation');

// ── ONLINE PAYMENTS ────────────────────────────────────────
$router->get('/pay',                        'Payments\PaymentController@checkout');
$router->post('/pay/initiate',              'Payments\PaymentController@initiate');
$router->get('/pay/status/{externalId}',    'Payments\PaymentController@status');
$router->get('/pay/receipt/{externalId}',   'Payments\PaymentController@receipt');
$router->post('/pay/callback',              'Payments\PaymentController@callback');
$router->get('/payments',                   'Payments\PaymentController@history');

// ── COMMITTEES ─────────────────────────────────────────────
$router->get('/committees',                         'Committees\CommitteeController@index');
$router->get('/committees/create',                  'Committees\CommitteeController@create');
$router->post('/committees',                        'Committees\CommitteeController@store');
$router->get('/committees/{id}',                    'Committees\CommitteeController@show');
$router->post('/committees/{id}/members',           'Committees\CommitteeController@addMember');
$router->post('/committees/members/{cmId}/remove',  'Committees\CommitteeController@removeMember');
$router->post('/committees/{id}/toggle',            'Committees\CommitteeController@toggle');
$router->post('/committees/{id}/delete',            'Committees\CommitteeController@destroy');

// ── 2FA (TOTP) LOGIN STEP ──────────────────────────────────
$router->get('/login/totp',   'Auth\AuthController@showTotp');
$router->post('/login/totp',  'Auth\AuthController@verifyTotp');

// ── SECURITY SETTINGS (2FA + Push) ────────────────────────
$router->get('/settings/security',                    'Settings\SettingsController@security');
$router->post('/settings/security/totp/setup',        'Settings\SettingsController@totpSetup');
$router->post('/settings/security/totp/confirm',      'Settings\SettingsController@totpConfirm');
$router->post('/settings/security/totp/disable',      'Settings\SettingsController@totpDisable');
$router->post('/settings/security/push/subscribe',    'Settings\SettingsController@pushSubscribe');
$router->post('/settings/security/push/unsubscribe',  'Settings\SettingsController@pushUnsubscribe');

// ── COMPARISON REPORT ──────────────────────────────────────
$router->get('/reports/comparison', 'Reports\ReportController@comparison');

// ── GLOBAL SEARCH ──────────────────────────────────────────
$router->get('/search', 'Search\SearchController@index');

// ── SELF-REGISTRATION (public) ─────────────────────────────
$router->get('/register',  'Auth\AuthController@showRegister');
$router->post('/register', 'Auth\AuthController@storeApplication');

// ── QR VERIFICATION (public) ───────────────────────────────
$router->get('/verify/{code}', 'Auth\AuthController@verify');

// ── BUDGET ─────────────────────────────────────────────────
$router->get('/budget',              'Budget\BudgetController@index');
$router->get('/budget/create',       'Budget\BudgetController@create');
$router->post('/budget',             'Budget\BudgetController@store');
$router->post('/budget/{id}/delete', 'Budget\BudgetController@destroy');

// ── ANNOUNCEMENTS ──────────────────────────────────────────
$router->get('/announcements',                   'Announcements\AnnouncementController@index');
$router->get('/announcements/create',            'Announcements\AnnouncementController@create');
$router->post('/announcements',                  'Announcements\AnnouncementController@store');
$router->post('/announcements/{id}/toggle',      'Announcements\AnnouncementController@toggle');
$router->post('/announcements/{id}/delete',      'Announcements\AnnouncementController@destroy');

// ── MASS SCHEDULES ─────────────────────────────────────────
$router->get('/mass-schedules',                  'MassSchedules\MassController@index');
$router->post('/mass-schedules',                 'MassSchedules\MassController@store');
$router->post('/mass-schedules/{id}/delete',     'MassSchedules\MassController@destroy');
$router->post('/mass-schedules/{id}/toggle',     'MassSchedules\MassController@toggle');

// ── AI KNOWLEDGE BASE ──────────────────────────────────────
$router->get('/ai-knowledge',                    'AIKnowledge\AIKnowledgeController@index');
$router->post('/ai-knowledge',                   'AIKnowledge\AIKnowledgeController@store');
$router->post('/ai-knowledge/{id}/delete',       'AIKnowledge\AIKnowledgeController@destroy');
$router->post('/ai-knowledge/{id}/toggle',       'AIKnowledge\AIKnowledgeController@toggle');

// ── CATHOLIC CONTENT ───────────────────────────────────────
$router->get('/catholic/prayers',                'Catholic\CatholicController@prayers');
$router->get('/catholic/calendar',               'Catholic\CatholicController@calendar');

// ── SACRAMENT CERTIFICATE ──────────────────────────────────
$router->get('/sacraments/{id}/certificate',     'Sacraments\SacramentController@certificate');

// ── PUBLIC WEBSITE ─────────────────────────────────────────
$router->get('/',                                'Website\WebsiteController@home');
$router->get('/give',                            'Website\WebsiteController@give');
$router->post('/give',                           'Website\WebsiteController@storeDonation');
$router->get('/mass-schedule-public',            'Website\WebsiteController@massSchedule');
$router->get('/announcements-public',            'Website\WebsiteController@announcementsPublic');

// ── ONLINE DONATIONS (staff) ───────────────────────────────
$router->get('/donations',                       'Website\WebsiteController@donations');
$router->post('/donations/{id}/verify',          'Website\WebsiteController@verifyDonation');

// ── MEMBER PORTAL ──────────────────────────────────────────
$router->get('/portal',                          'Portal\PortalController@dashboard');
$router->get('/portal/contributions',            'Portal\PortalController@contributions');
$router->get('/portal/receipts',                 'Portal\PortalController@receipts');
