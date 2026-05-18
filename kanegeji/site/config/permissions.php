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
    ],

    'accountant' => [
        'members.view',
        'accounting.view', 'accounting.create', 'accounting.edit', 'accounting.delete',
        'reports.view', 'reports.export',
        'jumuiya.view',
    ],

    'priest' => [
        'members.view',
        'accounting.view',
        'reports.view',
        'jumuiya.view',
    ],

    'secretary' => [
        'members.view', 'members.create', 'members.edit',
        'accounting.view', 'accounting.create',
        'jumuiya.view',
    ],

    'member' => [],
];
