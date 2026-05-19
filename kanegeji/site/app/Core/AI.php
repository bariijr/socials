<?php

namespace App\Core;

class AI
{
    private string $apiKey;
    private string $model;
    private array  $messages = [];

    public function __construct(string $model = 'gpt-4o-mini')
    {
        $this->apiKey = env('OPENAI_API_KEY', '');
        $this->model  = $model;
    }

    public function withHistory(array $messages): self
    {
        $this->messages = $messages;
        return $this;
    }

    public function ask(string $userMessage, string $systemPrompt = ''): ?string
    {
        if (!$this->apiKey) {
            return 'OpenAI API key haijasanidiwa. Tafadhali ongeza OPENAI_API_KEY katika .env';
        }

        $messages = [];
        if ($systemPrompt) {
            $messages[] = ['role' => 'system', 'content' => $systemPrompt];
        }
        foreach ($this->messages as $m) {
            $messages[] = ['role' => $m['role'], 'content' => $m['content']];
        }
        $messages[] = ['role' => 'user', 'content' => $userMessage];

        $payload = json_encode([
            'model'       => $this->model,
            'messages'    => $messages,
            'max_tokens'  => 1500,
            'temperature' => 0.3,
        ]);

        $ch = curl_init('https://api.openai.com/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $this->apiKey,
                'Content-Type: application/json',
            ],
        ]);

        $response = curl_exec($ch);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error || !$response) {
            error_log('OpenAI error: ' . $error);
            return null;
        }

        $data = json_decode($response, true);
        return $data['choices'][0]['message']['content'] ?? null;
    }

    /**
     * Search the knowledge base for relevant context before calling OpenAI.
     * Returns knowledge snippets as a string to prepend to the system prompt.
     */
    public static function searchKnowledge(int $parishId, string $query): string
    {
        try {
            $q       = '%' . $query . '%';
            $results = Database::select(
                "SELECT title, content FROM ai_knowledge
                 WHERE parish_id=? AND active=1
                   AND (title LIKE ? OR content LIKE ?)
                 ORDER BY CASE WHEN title LIKE ? THEN 0 ELSE 1 END ASC
                 LIMIT 3",
                [$parishId, $q, $q, $q]
            );

            if (empty($results)) return '';

            $context = "Maarifa yanayohusiana kutoka kwenye hifadhidata ya parokia:\n\n";
            foreach ($results as $r) {
                $excerpt  = mb_substr(strip_tags($r['content']), 0, 600);
                $context .= "**{$r['title']}**\n{$excerpt}\n\n";
            }
            return $context;
        } catch (\Throwable) {
            return '';
        }
    }

    public static function buildParishContext(int $parishId): string
    {
        $stats = Database::selectOne(
            "SELECT
                (SELECT COUNT(*) FROM members WHERE parish_id = ? AND status='active' AND deleted_at IS NULL) as members,
                (SELECT COUNT(*) FROM communities WHERE parish_id = ?) as communities,
                (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE parish_id=? AND type='income' AND status='approved' AND YEAR(transaction_date)=YEAR(CURDATE())) as income_ytd,
                (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE parish_id=? AND type='expense' AND status='approved' AND YEAR(transaction_date)=YEAR(CURDATE())) as expenses_ytd,
                (SELECT COUNT(*) FROM transactions WHERE parish_id=? AND status='pending') as pending_tx",
            [$parishId, $parishId, $parishId, $parishId, $parishId]
        );

        $parish = Database::selectOne("SELECT name, diocese FROM parishes WHERE id = ?", [$parishId]);

        return "Wewe ni msaidizi wa akili wa mfumo wa ERP wa Parokia ya " . ($parish['name'] ?? 'Kanegeji') . ", " . ($parish['diocese'] ?? 'Tanzania') . ".
Takwimu za sasa (mwaka huu):
- Wanachama wanaofanya kazi: " . ($stats['members'] ?? 0) . "
- Jumuiya: " . ($stats['communities'] ?? 0) . "
- Mapato YTD: TZS " . number_format($stats['income_ytd'] ?? 0) . "
- Matumizi YTD: TZS " . number_format($stats['expenses_ytd'] ?? 0) . "
- Miamala inayosubiri idhini: " . ($stats['pending_tx'] ?? 0) . "

Jibu maswali kwa Kiswahili. Kama data haipo, sema wazi. Usitoe data ya nje ya mfumo huu.";
    }
}
