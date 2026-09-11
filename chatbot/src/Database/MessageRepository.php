<?php

declare(strict_types=1);

namespace Chatbot\Database;

use PDO;

final class MessageRepository
{
    public function __construct(private PDO $db)
    {
    }

    public function add(int $sessionId, string $role, string $content): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO chat_messages (session_id, role, content) VALUES (:session_id, :role, :content)'
        );
        $stmt->execute([
            'session_id' => $sessionId,
            'role' => $role,
            'content' => $content,
        ]);

        return (int) $this->db->lastInsertId();
    }

    /**
     * Recent history for this session, oldest first, capped at $limit
     * messages so it fits comfortably in the LLM context window.
     */
    public function recentHistory(int $sessionId, int $limit = 12): array
    {
        $stmt = $this->db->prepare(
            'SELECT role, content FROM chat_messages
             WHERE session_id = :session_id
             ORDER BY id DESC
             LIMIT :limit'
        );
        $stmt->bindValue('session_id', $sessionId, PDO::PARAM_INT);
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return array_reverse($stmt->fetchAll());
    }
}
