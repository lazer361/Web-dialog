<?php

declare(strict_types=1);

final class TokenModel
{
    public function __construct(private PDO $db)
    {
    }

    public function create(int $userId, string $token, string $expiresAt): int
    {
        $stmt = $this->db->prepare('INSERT INTO user_tokens (user_id, token, expires_at) VALUES (:user_id, :token, :expires_at)');
        $stmt->execute([
            'user_id' => $userId,
            'token' => $token,
            'expires_at' => $expiresAt,
        ]);

        return (int) $this->db->lastInsertId();
    }

    public function findActive(string $token): ?array
    {
        $stmt = $this->db->prepare('SELECT id, user_id, token, created_at, expires_at FROM user_tokens WHERE token = :token AND expires_at > NOW() LIMIT 1');
        $stmt->execute(['token' => $token]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function deleteByToken(string $token): void
    {
        $stmt = $this->db->prepare('DELETE FROM user_tokens WHERE token = :token');
        $stmt->execute(['token' => $token]);
    }

    public function deleteExpired(): void
    {
        $this->db->exec('DELETE FROM user_tokens WHERE expires_at <= NOW()');
    }
}
