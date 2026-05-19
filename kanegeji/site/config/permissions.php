<?php

/**
 * Maps role slugs to their allowed permission slugs.
 * super_admin gets everything implicitly — no need to list.
 */
return [
    'chairman' => [
        'members.view', 'members.create', 'members.edit',
        'accounting.view', 'accounting.approve',
        'reports.view', 'reports.export',
        'jumuiya.view', 'jumuiya.manage',
        'users.view', 'audit.view',
        'payroll_view', 'payroll_approve',
        'inventory_view', 'inventory_manage',
        'documents_view', 'documents_manage',
        'events_view', 'events_manage',
        'bookings_view', 'bookings_manage', 'bookings_approve',
        'families.view', 'families.manage',
        'sacraments.view', 'sacraments.manage',
        'accounting.create', 'accounting.edit', 'accounting.delete',
        'pledges_view', 'pledges_manage',
        'notifications_view', 'notifications_send',
        'ai_view',
        'reconciliation_view',
    ],

    'accountant' => [
        'members.view',
        'accounting.view', 'accounting.create', 'accounting.edit', 'accounting.delete',
        'reports.view', 'reports.export',
        'jumuiya.view',
        'payroll_view', 'payroll_manage', 'payroll_approve',
        'inventory_view',
        'documents_view',
        'bookings_view',
        'pledges_view', 'pledges_manage',
        'notifications_view',
        'ai_view',
        'reconciliation_view',
        'accounting.approve',
    ],

    'priest' => [
        'members.view',
        'accounting.view',
        'reports.view',
        'jumuiya.view',
        'documents_view',
        'events_view',
        'bookings_view',
        'inventory_view',
        'families.view',
        'sacraments.view', 'sacraments.manage',
        'pledges_view',
        'ai_view',
    ],

    'secretary' => [
        'members.view', 'members.create', 'members.edit',
        'accounting.view', 'accounting.create',
        'jumuiya.view',
        'documents_view', 'documents_manage',
        'events_view', 'events_manage',
        'bookings_view', 'bookings_manage',
        'inventory_view',
        'families.view', 'families.manage',
        'sacraments.view',
        'pledges_view',
        'notifications_view', 'notifications_send',
        'ai_view',
    ],

    'member' => [],
];
