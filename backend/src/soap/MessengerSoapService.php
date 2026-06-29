<?php

declare(strict_types=1);

final class MessengerSoapService
{
    public function __construct(private AppServices $app)
    {
    }

    public function Register(string $name, string $email, string $password): array
    {
        return $this->normalize($this->app->auth->register($name, $email, $password));
    }

    public function Login(string $email, string $password): array
    {
        return $this->normalize($this->app->auth->login($email, $password));
    }

    public function Logout(string $token): array
    {
        return $this->normalize($this->app->auth->logout($token));
    }

    public function GetCurrentUser(string $token): array
    {
        return $this->normalize($this->app->auth->getCurrentUser($token));
    }

    public function GetUsers(string $token): array
    {
        return $this->normalize($this->app->userService->getUsers($token));
    }

    public function GetMessages(string $token, int $otherUserId, int $limit = 50): array
    {
        return $this->normalize($this->app->messageService->getMessages($token, $otherUserId, $limit));
    }

    private function normalize(array $data): array
    {
        if (!isset($data['message'])) {
            $data['message'] = $data['success'] ? 'Операция выполнена' : 'Ошибка выполнения операции';
        }

        if (isset($data['user']) && is_array($data['user'])) {
            $data['user'] = $this->normalizeUser($data['user']);
        }

        if (isset($data['users']) && is_array($data['users'])) {
            $data['users'] = array_map(fn (array $user): array => $this->normalizeUser($user), $data['users']);
        }

        if (isset($data['messages']) && is_array($data['messages'])) {
            $data['messages'] = array_map(fn (array $message): array => $this->normalizeMessage($message), $data['messages']);
        }

        if (isset($data['token'])) {
            $data['token'] = (string) $data['token'];
        }

        if (isset($data['expires_at'])) {
            $data['expires_at'] = (string) $data['expires_at'];
        }

        return $data;
    }

    private function normalizeUser(array $user): array
    {
        return [
            'id' => (int) ($user['id'] ?? 0),
            'name' => (string) ($user['name'] ?? ''),
            'email' => (string) ($user['email'] ?? ''),
            'created_at' => (string) ($user['created_at'] ?? ''),
        ];
    }

    private function normalizeMessage(array $message): array
    {
        return [
            'id' => (int) ($message['id'] ?? 0),
            'sender_id' => (int) ($message['sender_id'] ?? 0),
            'receiver_id' => (int) ($message['receiver_id'] ?? 0),
            'text' => (string) ($message['text'] ?? ''),
            'created_at' => (string) ($message['created_at'] ?? ''),
            'is_read' => (bool) ($message['is_read'] ?? false),
        ];
    }
}
