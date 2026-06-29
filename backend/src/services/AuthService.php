<?php

declare(strict_types=1);

final class AuthService
{
    public function __construct(
        private UserModel $users,
        private TokenModel $tokens
    ) {
    }

    public function register(string $name, string $email, string $password): array
    {
        $name = trim($name);
        $email = mb_strtolower(trim($email));

        if ($name === '' || $email === '' || $password === '') {
            return $this->fail('Заполните все поля');
        }

        if (mb_strlen($name) > 100) {
            return $this->fail('Имя не должно быть длиннее 100 символов');
        }

        if (mb_strlen($email) > 190) {
            return $this->fail('Email не должен быть длиннее 190 символов');
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->fail('Некорректный email');
        }

        if (mb_strlen($password) > 255) {
            return $this->fail('Пароль слишком длинный');
        }

        if (mb_strlen($password) < 6) {
            return $this->fail('Пароль должен быть не короче 6 символов');
        }

        if ($this->users->findByEmail($email) !== null) {
            return $this->fail('Пользователь с таким email уже существует');
        }

        // Пароль сохраняется только в виде хеша.
        $userId = $this->users->create($name, $email, password_hash($password, PASSWORD_DEFAULT));
        $user = $this->users->findById($userId);

        return [
            'success' => true,
            'message' => 'Пользователь зарегистрирован',
            'user' => $user,
        ];
    }

    public function login(string $email, string $password): array
    {
        $email = mb_strtolower(trim($email));
        $user = $this->users->findByEmail($email);

        if ($user === null || !password_verify($password, $user['password_hash'])) {
            return $this->fail('Неверный email или пароль');
        }

        // Токен используется вместо постоянной отправки логина и пароля.
        $token = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + 86400);
        $this->tokens->create((int) $user['id'], $token, $expiresAt);
        unset($user['password_hash']);

        return [
            'success' => true,
            'message' => 'Вход выполнен',
            'token' => $token,
            'expires_at' => $expiresAt,
            'user' => $user,
        ];
    }

    public function logout(string $token): array
    {
        $token = trim($token);

        if ($token === '') {
            return $this->fail('Токен не передан');
        }

        $this->tokens->deleteByToken($token);

        return [
            'success' => true,
            'message' => 'Выход выполнен',
        ];
    }

    public function getCurrentUser(string $token): array
    {
        $user = $this->getUserByToken($token);

        if ($user === null) {
            return $this->fail('Пользователь не авторизован');
        }

        return [
            'success' => true,
            'user' => $user,
        ];
    }

    public function getUserByToken(string $token): ?array
    {
        // По токену определяем текущего пользователя.
        $tokenRow = $this->tokens->findActive(trim($token));

        if ($tokenRow === null) {
            return null;
        }

        return $this->users->findById((int) $tokenRow['user_id']);
    }

    private function fail(string $message): array
    {
        return [
            'success' => false,
            'message' => $message,
        ];
    }
}
