<?php

declare(strict_types=1);

namespace Chatbot\Database;

use PDO;

final class SessionRepository
{
    public function __construct(private PDO $db)
    {
    }

    /**
     * Creates a session row. $ipPartial must already be anonymized
     * (last octet zeroed / hashed) by the caller — never pass a raw IP.
     */
    public function create(string $sessionToken, ?string $ipPartial): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO chat_sessions (session_token, ip_partial) VALUES (:token, :ip)'
        );
        $stmt->execute([
            'token' => $sessionToken,
            'ip' => $ipPartial,
        ]);

        return (int) $this->db->lastInsertId();
    }

    public function findByToken(string $sessionToken): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, session_token, created_at FROM chat_sessions WHERE session_token = :token LIMIT 1'
        );
        $stmt->execute(['token' => $sessionToken]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function countRecentMessagesForRateLimit(int $sessionId, int $windowSeconds = 60): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) AS c FROM chat_messages
             WHERE session_id = :session_id
               AND role = "user"
               AND created_at >= (NOW() - INTERVAL :window SECOND)'
        );
        $stmt->execute(['session_id' => $sessionId, 'window' => $windowSeconds]);
        $row = $stmt->fetch();

        return (int) ($row['c'] ?? 0);
    }
}
