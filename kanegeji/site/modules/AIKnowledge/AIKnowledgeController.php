<?php

namespace App\Modules\AIKnowledge;

use App\Core\Controller;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;

class AIKnowledgeController extends Controller
{
    public function __construct()
    {
        $this->requireAuth();
        $this->requirePermission('knowledge_view');
    }

    public function index(): void
    {
        $pid  = Auth::parishId();
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = 20;
        $offset  = ($page - 1) * $perPage;

        $total = Database::selectOne("SELECT COUNT(*) as cnt FROM ai_knowledge WHERE parish_id=?", [$pid])['cnt'];
        $rows  = Database::select(
            "SELECT k.*, u.name as author FROM ai_knowledge k
             LEFT JOIN users u ON u.id = k.created_by
             WHERE k.parish_id=? ORDER BY k.created_at DESC LIMIT {$perPage} OFFSET {$offset}",
            [$pid]
        );

        $this->view('AIKnowledge/views/index', compact('rows', 'total', 'page', 'perPage'));
    }

    public function store(): void
    {
        $this->requirePermission('knowledge_manage');
        $this->verifyCsrf();

        $pid   = Auth::parishId();
        $title = trim($_POST['title'] ?? '');
        $type  = $_POST['type'] ?? 'document';
        $tags  = trim($_POST['tags'] ?? '') ?: null;

        // Handle file upload (PDF or TXT)
        $content    = '';
        $sourceFile = null;

        if (!empty($_FILES['document']['name']) && $_FILES['document']['error'] === UPLOAD_ERR_OK) {
            $ext     = strtolower(pathinfo($_FILES['document']['name'], PATHINFO_EXTENSION));
            $allowed = ['txt', 'pdf'];
            if (!in_array($ext, $allowed)) {
                $_SESSION['flash'] = ['type' => 'error', 'message' => 'Faili lazima iwe TXT au PDF.'];
                redirect('/ai-knowledge');
            }

            $dir  = BASE_PATH . '/storage/uploads/knowledge/';
            if (!is_dir($dir)) mkdir($dir, 0755, true);
            $filename   = uniqid('kb_', true) . '.' . $ext;
            $sourceFile = $filename;
            move_uploaded_file($_FILES['document']['tmp_name'], $dir . $filename);

            if ($ext === 'txt') {
                $content = file_get_contents($dir . $filename);
            } elseif ($ext === 'pdf' && class_exists('\Mpdf\Mpdf')) {
                // Basic PDF text extraction not built-in; store placeholder
                $content = trim($_POST['content'] ?? '(PDF uploaded — add summary below)');
            }
        }

        // Allow manual content override / addition
        $manualContent = trim($_POST['content'] ?? '');
        if ($manualContent) $content = $content ? $content . "\n\n" . $manualContent : $manualContent;

        if (!$title || !$content) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Jaza kichwa na maudhui.'];
            redirect('/ai-knowledge');
        }

        $wordCount = str_word_count(strip_tags($content));
        $id = Database::insert(
            "INSERT INTO ai_knowledge (parish_id, title, content, type, source_file, word_count, tags, active, created_by, created_at)
             VALUES (?,?,?,?,?,?,?,1,?,NOW())",
            [$pid, $title, $content, $type, $sourceFile, $wordCount, $tags, Auth::id()]
        );

        Audit::log('create', 'AIKnowledge', 'ai_knowledge', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => "Maarifa yamehifadhiwa ({$wordCount} maneno)."];
        redirect('/ai-knowledge');
    }

    public function destroy(int $id): void
    {
        $this->requirePermission('knowledge_manage');
        $this->verifyCsrf();

        $k = Database::selectOne("SELECT source_file FROM ai_knowledge WHERE id=? AND parish_id=?", [$id, Auth::parishId()]);
        if (!$k) redirect('/ai-knowledge');

        if ($k['source_file']) {
            @unlink(BASE_PATH . '/storage/uploads/knowledge/' . $k['source_file']);
        }
        Database::execute("DELETE FROM ai_knowledge WHERE id=?", [$id]);
        Audit::log('delete', 'AIKnowledge', 'ai_knowledge', $id);
        $_SESSION['flash'] = ['type' => 'success', 'message' => 'Maarifa yamefutwa.'];
        redirect('/ai-knowledge');
    }

    public function toggle(int $id): void
    {
        $this->requirePermission('knowledge_manage');
        $this->verifyCsrf();
        $k = Database::selectOne("SELECT active FROM ai_knowledge WHERE id=? AND parish_id=?", [$id, Auth::parishId()]);
        if ($k) Database::execute("UPDATE ai_knowledge SET active=? WHERE id=?", [$k['active'] ? 0 : 1, $id]);
        redirect('/ai-knowledge');
    }

    /**
     * Search knowledge base — used internally by AI.php
     */
    public static function searchKnowledge(int $parishId, string $query): string
    {
        $q = '%' . $query . '%';
        $results = Database::select(
            "SELECT title, content FROM ai_knowledge
             WHERE parish_id=? AND active=1
               AND (MATCH(title, content) AGAINST(? IN BOOLEAN MODE) OR title LIKE ? OR content LIKE ?)
             LIMIT 3",
            [$parishId, $query, $q, $q]
        );

        if (empty($results)) return '';

        $context = "Maarifa kutoka kwenye hifadhidata ya parokia:\n\n";
        foreach ($results as $r) {
            $excerpt  = mb_substr(strip_tags($r['content']), 0, 800);
            $context .= "### {$r['title']}\n{$excerpt}\n\n";
        }
        return $context;
    }
}
