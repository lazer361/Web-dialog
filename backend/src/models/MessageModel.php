<?php

declare(strict_types=1);

final class MessageModel
{
    public function __construct(private PDO $db)
    {
    }

    public function create(int $senderId, int $receiverId, string $text): int
    {
        $stmt = $this->db->prepare('INSERT INTO messages (sender_id, receiver_id, text) VALUES (:sender_id, :receiver_id, :text)');
        $stmt->execute([
            'sender_id' => $senderId,
            'receiver_id' => $receiverId,
            'text' => $text,
        ]);

        return (int) $this->db->lastInsertId();
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT id, sender_id, receiver_id, text, created_at, is_read FROM messages WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $message = $stmt->fetch();

        return $message ?: null;
    }

    public function getDialog(int $currentUserId, int $otherUserId, int $limit = 50): array
    {
        $limit = max(1, min($limit, 100));
        $stmt = $this->db->prepare(
            'SELECT id, sender_id, receiver_id, text, created_at, is_read
             FROM messages
             WHERE (sender_id = :current_user_1 AND receiver_id = :other_user_1)
                OR (sender_id = :other_user_2 AND receiver_id = :current_user_2)
             ORDER BY created_at DESC, id DESC
             LIMIT ' . $limit
        );
        $stmt->execute([
            'current_user_1' => $currentUserId,
            'other_user_1' => $otherUserId,
            'other_user_2' => $otherUserId,
            'current_user_2' => $currentUserId,
        ]);

        return array_reverse($stmt->fetchAll());
    }

    public function markDialogAsRead(int $currentUserId, int $otherUserId): void
    {
        $stmt = $this->db->prepare('UPDATE messages SET is_read = 1 WHERE sender_id = :other_user_id AND receiver_id = :current_user_id');
        $stmt->execute([
            'other_user_id' => $otherUserId,
            'current_user_id' => $currentUserId,
        ]);
    }
}
