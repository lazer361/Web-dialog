<?php

declare(strict_types=1);

final class UserService
{
    public function __construct(
        private UserModel $users,
        private AuthService $auth
    ) {
    }

    public function getUsers(string $token): array
    {
        $currentUser = $this->auth->getUserByToken($token);

        if ($currentUser === null) {
            return [
                'success' => false,
                'message' => 'Пользователь не авторизован',
            ];
        }

        return [
            'success' => true,
            'users' => $this->users->getUsersExcept((int) $currentUser['id']),
        ];
    }
}
