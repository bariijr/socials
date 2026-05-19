<?php

namespace App\Modules\Search;

use App\Core\{Auth, Controller, Database, Request};

class SearchController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
    }

    public function index(): void
    {
        $q   = trim(Request::get('q', ''));
        $pid = Auth::parishId();

        $members       = [];
        $transactions  = [];
        $documents     = [];
        $events        = [];
        $announcements = [];

        if (mb_strlen($q) >= 2) {
            $like = '%' . $q . '%';

            if (Auth::can('members.view')) {
                $members = Database::select(
                    "SELECT id, first_name, last_name, phone, member_number
                     FROM members
                     WHERE parish_id=? AND deleted_at IS NULL
                       AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR member_number LIKE ?)
                     LIMIT 8",
                    [$pid, $like, $like, $like, $like]
                );
            }

            if (Auth::can('accounting.view')) {
                $transactions = Database::select(
                    "SELECT t.id, t.description, t.amount, t.type, t.transaction_date, c.name as category_name
                     FROM transactions t
                     LEFT JOIN categories c ON c.id = t.category_id
                     WHERE t.parish_id=? AND t.deleted_at IS NULL
                       AND (t.description LIKE ? OR t.reference_number LIKE ?)
                     ORDER BY t.transaction_date DESC LIMIT 8",
                    [$pid, $like, $like]
                );
            }

            if (Auth::can('documents_view')) {
                $documents = Database::select(
                    "SELECT id, title, description, created_at
                     FROM documents
                     WHERE parish_id=? AND deleted_at IS NULL
                       AND (title LIKE ? OR description LIKE ?)
                     ORDER BY created_at DESC LIMIT 6",
                    [$pid, $like, $like]
                );
            }

            if (Auth::can('events_view')) {
                $events = Database::select(
                    "SELECT id, title, description, start_date, location
                     FROM events
                     WHERE parish_id=? AND deleted_at IS NULL
                       AND (title LIKE ? OR description LIKE ? OR location LIKE ?)
                     ORDER BY start_date DESC LIMIT 6",
                    [$pid, $like, $like, $like]
                );
            }

            if (Auth::can('announcements_view')) {
                $announcements = Database::select(
                    "SELECT id, title, content, type, created_at
                     FROM announcements
                     WHERE parish_id=? AND deleted_at IS NULL
                       AND (title LIKE ? OR content LIKE ?)
                     ORDER BY created_at DESC LIMIT 6",
                    [$pid, $like, $like]
                );
            }
        }

        $total = count($members) + count($transactions) + count($documents)
               + count($events) + count($announcements);

        $this->view('Search/views/results',
            compact('q', 'members', 'transactions', 'documents', 'events', 'announcements', 'total'),
            'main'
        );
    }
}
