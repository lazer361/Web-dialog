<?php

declare(strict_types=1);

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/models/UserModel.php';
require_once __DIR__ . '/models/TokenModel.php';
require_once __DIR__ . '/models/MessageModel.php';
require_once __DIR__ . '/services/AuthService.php';
require_once __DIR__ . '/services/UserService.php';
require_once __DIR__ . '/services/MessageService.php';
require_once __DIR__ . '/soap/MessengerSoapService.php';
require_once __DIR__ . '/websocket/WebSocketServer.php';

final class AppServices
{
    public readonly PDO $db;
    public readonly UserModel $users;
    public readonly TokenModel $tokens;
    public readonly MessageModel $messages;
    public readonly AuthService $auth;
    public readonly UserService $userService;
    public readonly MessageService $messageService;

    public function __construct()
    {
        $this->db = Database::connect();
        $this->users = new UserModel($this->db);
        $this->tokens = new TokenModel($this->db);
        $this->messages = new MessageModel($this->db);
        $this->auth = new AuthService($this->users, $this->tokens);
        $this->userService = new UserService($this->users, $this->auth);
        $this->messageService = new MessageService($this->messages, $this->users, $this->auth);
    }
}
