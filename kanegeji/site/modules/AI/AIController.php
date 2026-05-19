<?php

namespace App\Modules\AI;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\AI;

class AIController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
        $this->requirePermission('ai_view');
    }

    public function index(): void
    {
        $pid  = Auth::parishId();
        $uid  = Auth::id();

        $conversations = Database::select(
            "SELECT * FROM ai_conversations WHERE parish_id=? AND user_id=? ORDER BY created_at DESC LIMIT 20",
            [$pid, $uid]
        );

        $convId   = (int) ($_GET['conv'] ?? 0);
        $messages = [];
        $current  = null;

        if ($convId) {
            $current = Database::selectOne(
                "SELECT * FROM ai_conversations WHERE id=? AND parish_id=? AND user_id=?",
                [$convId, $pid, $uid]
            );
            if ($current) {
                $messages = Database::select(
                    "SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY created_at ASC",
                    [$convId]
                );
            }
        }

        $this->view('AI/views/chat', compact('conversations', 'messages', 'current', 'convId'));
    }

    public function ask(): void
    {
        $this->verifyCsrf();

        $pid     = Auth::parishId();
        $uid     = Auth::id();
        $message = trim($_POST['message'] ?? '');
        $convId  = (int) ($_POST['conv_id'] ?? 0);

        if (!$message) redirect('/ai');

        // Create or fetch conversation
        if (!$convId) {
            $title  = mb_substr($message, 0, 60) . (mb_strlen($message) > 60 ? '…' : '');
            $convId = Database::insert(
                "INSERT INTO ai_conversations (parish_id, user_id, title, created_at) VALUES (?,?,?,NOW())",
                [$pid, $uid, $title]
            );
        } else {
            $conv = Database::selectOne(
                "SELECT id FROM ai_conversations WHERE id=? AND parish_id=? AND user_id=?",
                [$convId, $pid, $uid]
            );
            if (!$conv) redirect('/ai');
        }

        // Save user message
        Database::insert(
            "INSERT INTO ai_messages (conversation_id, role, content, created_at) VALUES (?,'user',?,NOW())",
            [$convId, $message]
        );

        // Fetch prior history (all messages before current user message)
        $history = Database::select(
            "SELECT role, content FROM ai_messages
             WHERE conversation_id=? ORDER BY created_at ASC LIMIT 38",
            [$convId]
        );
        // Remove the last item (the user message we just saved)
        array_pop($history);

        // Search knowledge base for relevant context
        $knowledgeContext = AI::searchKnowledge($pid, $message);

        // Call AI with prior history + knowledge context + current message
        $ai     = new AI();
        $system = AI::buildParishContext($pid);
        if ($knowledgeContext) {
            $system .= "\n\n" . $knowledgeContext;
        }
        $response = $ai->withHistory($history)->ask($message, $system);

        if (!$response) {
            $response = 'Samahani, nimekuwa na tatizo la kiufundi. Jaribu tena baadaye.';
        }

        // Save assistant message
        Database::insert(
            "INSERT INTO ai_messages (conversation_id, role, content, created_at) VALUES (?,'assistant',?,NOW())",
            [$convId, $response]
        );

        redirect('/ai?conv=' . $convId);
    }

    public function deleteConversation(int $id): void
    {
        $this->verifyCsrf();
        $pid = Auth::parishId();
        $uid = Auth::id();
        Database::execute(
            "DELETE FROM ai_conversations WHERE id=? AND parish_id=? AND user_id=?",
            [$id, $pid, $uid]
        );
        redirect('/ai');
    }
}
