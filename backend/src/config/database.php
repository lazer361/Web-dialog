<?php

declare(strict_types=1);

final class Database
{
    public static function connect(): PDO
    {
        // Данные подключения берутся из Docker, поэтому их не надо прописывать вручную.
        $host = getenv('DB_HOST') ?: '127.0.0.1';
        $port = getenv('DB_PORT') ?: '3306';
        $name = getenv('DB_NAME') ?: 'webdialog';
        $user = getenv('DB_USER') ?: 'webdialog_user';
        $password = getenv('DB_PASSWORD') ?: 'webdialog_pass';
        $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";

        return new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
}
