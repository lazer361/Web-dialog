<?php

declare(strict_types=1);

final class MessageService
{
    public function __construct(
        private MessageModel $messages,
        private UserModel $users,
        private AuthService $auth
    ) {
    }

    // История берётся сразу в две стороны: мои сообщения и сообщения собеседника.
    public function getMessages(string $token, int $otherUserId, int $limit = 50): array
    {
        $currentUser = $this->auth->getUserByToken($token);

        if ($currentUser === null) {
            return $this->fail('Пользователь не авторизован');
        }

        if ($this->users->findById($otherUserId) === null) {
            return $this->fail('Пользователь не найден');
        }

        $currentUserId = (int) $currentUser['id'];
        $this->messages->markDialogAsRead($currentUserId, $otherUserId);

        return [
            'success' => true,
            'messages' => $this->messages->getDialog($currentUserId, $otherUserId, $limit),
        ];
    }

    // Новое сообщение сохраняется в таблицу messages.
    public function saveMessage(int $senderId, int $receiverId, string $text): array
    {
        $text = trim($text);

        if ($text === '') {
            return $this->fail('Сообщение не может быть пустым');
        }

        if (mb_strlen($text) > 1000) {
            return $this->fail('Сообщение не должно быть длиннее 1000 символов');
        }


        if ($this->users->findById($senderId) === null || $this->users->findById($receiverId) === null) {
            return $this->fail('Пользователь не найден');
        }

        $messageId = $this->messages->create($senderId, $receiverId, $text);

        return [
            'success' => true,
            'message' => $this->messages->findById($messageId),
        ];
    }

    private function fail(string $message): array
    {
        return [
            'success' => false,
            'message' => $message,
        ];
    }
}
