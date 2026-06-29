<?php

declare(strict_types=1);

// WebSocket отвечает за новые сообщения в реальном времени.
final class WebSocketServer
{
    private array $clients = [];
    private array $authenticated = [];
    private array $usersByConnection = [];
    private array $connectionsByUser = [];
    private array $buffers = [];

    public function __construct(
        private string $host,
        private int $port,
        private AuthService $auth,
        private MessageService $messages
    ) {
    }

    public function run(): void
    {
        $server = stream_socket_server("tcp://{$this->host}:{$this->port}", $errno, $error);

        if ($server === false) {
            throw new RuntimeException("Не удалось запустить WebSocket-сервер: {$error}");
        }

        stream_set_blocking($server, false);
        echo "WebSocket server started on {$this->host}:{$this->port}\n";

        while (true) {
            $read = array_merge([$server], $this->clients);
            $write = null;
            $except = null;

            if (stream_select($read, $write, $except, null) === false) {
                continue;
            }

            foreach ($read as $socket) {
                if ($socket === $server) {
                    $client = stream_socket_accept($server, 0);

                    if ($client !== false) {
                        stream_set_blocking($client, false);
                        $connectionId = (int) $client;
                        $this->clients[$connectionId] = $client;
                        $this->buffers[$connectionId] = '';
                    }

                    continue;
                }

                $data = fread($socket, 8192);

                if ($data === '' || $data === false) {
                    $this->disconnect($socket);
                    continue;
                }

                $connectionId = (int) $socket;

                if (!isset($this->authenticated[$connectionId])) {
                    $this->handshake($socket, $data);
                    $this->authenticated[$connectionId] = false;
                    continue;
                }

                $messages = $this->decodeFrames($socket, $data);
                foreach ($messages as $message) {
                    $this->handleMessage($socket, $message);
                }
            }
        }
    }

    private function handshake($socket, string $request): void
    {
        if (!preg_match('/Sec-WebSocket-Key:\s*(.*)\r\n/i', $request, $matches)) {
            $this->disconnect($socket);
            return;
        }

        $key = trim($matches[1]);
        $accept = base64_encode(sha1($key . '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', true));
        $headers = "HTTP/1.1 101 Switching Protocols\r\n";
        $headers .= "Upgrade: websocket\r\n";
        $headers .= "Connection: Upgrade\r\n";
        $headers .= "Sec-WebSocket-Accept: {$accept}\r\n\r\n";
        fwrite($socket, $headers);
    }

    private function handleMessage($socket, string $raw): void
    {
        $data = json_decode($raw, true);

        if (!is_array($data)) {
            $this->send($socket, ['type' => 'error', 'message' => 'Некорректный формат сообщения']);
            return;
        }

        $type = (string) ($data['type'] ?? '');

        // Сначала клиент подтверждает себя токеном.
        if ($type === 'auth') {
            $this->handleAuth($socket, (string) ($data['token'] ?? ''));
            return;
        }

        // После отправки сообщение сохраняется и передаётся получателю, если он онлайн.
        if ($type === 'private_message') {
            $this->handlePrivateMessage($socket, $data);
            return;
        }

        $this->send($socket, ['type' => 'error', 'message' => 'Неизвестное событие']);
    }

    private function handleAuth($socket, string $token): void
    {
        $connectionId = (int) $socket;
        $user = $this->auth->getUserByToken($token);

        if ($user === null) {
            $this->send($socket, ['type' => 'error', 'message' => 'Пользователь не авторизован']);
            return;
        }

        $userId = (int) $user['id'];
        $this->removeUserConnection($connectionId);

        $this->authenticated[$connectionId] = true;
        $this->usersByConnection[$connectionId] = $userId;
        if (!isset($this->connectionsByUser[$userId])) {
            $this->connectionsByUser[$userId] = [];
        }
        $this->connectionsByUser[$userId][$connectionId] = $socket;
        unset($user['password_hash']);

        $this->send($socket, [
            'type' => 'auth',
            'success' => true,
            'user' => $user,
        ]);
    }

    private function handlePrivateMessage($socket, array $data): void
    {
        $connectionId = (int) $socket;
        $senderId = $this->usersByConnection[$connectionId] ?? null;

        if ($senderId === null || ($this->authenticated[$connectionId] ?? false) !== true) {
            $this->send($socket, ['type' => 'error', 'message' => 'Сначала выполните авторизацию WebSocket']);
            return;
        }

        $receiverId = (int) ($data['receiver_id'] ?? 0);
        $text = (string) ($data['text'] ?? '');
        $result = $this->messages->saveMessage((int) $senderId, $receiverId, $text);

        if (($result['success'] ?? false) !== true) {
            $this->send($socket, ['type' => 'error', 'message' => $result['message'] ?? 'Сообщение не отправлено']);
            return;
        }

        $message = $result['message'];
        $this->send($socket, [
            'type' => 'message_sent',
            'success' => true,
            'message' => $message,
        ]);

        if ($receiverId !== (int) $senderId) {
            $this->sendToUser($receiverId, [
                'type' => 'new_message',
                'message' => $message,
            ]);
        } else {
            $this->sendToUser((int) $senderId, [
                'type' => 'new_message',
                'message' => $message,
            ], $connectionId);
        }
    }

    private function sendToUser(int $userId, array $payload, ?int $exceptConnectionId = null): void
    {
        if (!isset($this->connectionsByUser[$userId])) {
            return;
        }

        foreach ($this->connectionsByUser[$userId] as $connectionId => $connection) {
            if ($exceptConnectionId !== null && (int) $connectionId === $exceptConnectionId) {
                continue;
            }

            if (!is_resource($connection)) {
                unset($this->connectionsByUser[$userId][$connectionId]);
                continue;
            }

            if (!$this->send($connection, $payload)) {
                $this->disconnect($connection);
            }
        }

        if (isset($this->connectionsByUser[$userId]) && empty($this->connectionsByUser[$userId])) {
            unset($this->connectionsByUser[$userId]);
        }
    }

    private function send($socket, array $payload): bool
    {
        if (!is_resource($socket)) {
            return false;
        }

        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return false;
        }

        return $this->sendFrame($socket, $json, 1);
    }

    private function sendFrame($socket, string $payload, int $opcode): bool
    {
        $frame = $this->encodeFrame($payload, $opcode);
        $remaining = $frame;
        $attempts = 0;

        while ($remaining !== '' && $attempts < 5) {
            $written = @fwrite($socket, $remaining);
            if ($written === false) {
                return false;
            }
            if ($written === 0) {
                $attempts++;
                usleep(1000);
                continue;
            }
            $remaining = substr($remaining, $written);
        }

        return $remaining === '';
    }

    private function disconnect($socket): void
    {
        $connectionId = (int) $socket;
        $this->removeUserConnection($connectionId);
        unset($this->clients[$connectionId], $this->authenticated[$connectionId], $this->buffers[$connectionId]);

        if (is_resource($socket)) {
            fclose($socket);
        }
    }

    private function removeUserConnection(int $connectionId): void
    {
        if (!isset($this->usersByConnection[$connectionId])) {
            return;
        }

        $userId = $this->usersByConnection[$connectionId];
        unset($this->connectionsByUser[$userId][$connectionId], $this->usersByConnection[$connectionId]);
        if (isset($this->connectionsByUser[$userId]) && empty($this->connectionsByUser[$userId])) {
            unset($this->connectionsByUser[$userId]);
        }
    }

    private function decodeFrames($socket, string $chunk): array
    {
        $connectionId = (int) $socket;
        $this->buffers[$connectionId] = ($this->buffers[$connectionId] ?? '') . $chunk;
        $messages = [];

        while (true) {
            $buffer = $this->buffers[$connectionId] ?? '';
            $bufferLength = strlen($buffer);

            if ($bufferLength < 2) {
                break;
            }

            $first = ord($buffer[0]);
            $second = ord($buffer[1]);
            $opcode = $first & 15;
            $masked = ($second & 128) === 128;
            $payloadLength = $second & 127;
            $offset = 2;

            if ($payloadLength === 126) {
                if ($bufferLength < 4) {
                    break;
                }
                $payloadLength = unpack('n', substr($buffer, 2, 2))[1];
                $offset = 4;
            } elseif ($payloadLength === 127) {
                if ($bufferLength < 10) {
                    break;
                }
                $parts = unpack('N2', substr($buffer, 2, 8));
                $payloadLength = ($parts[1] * 4294967296) + $parts[2];
                $offset = 10;
            }

            if (!$masked) {
                $this->disconnect($socket);
                break;
            }

            if ($bufferLength < $offset + 4 + $payloadLength) {
                break;
            }

            $mask = substr($buffer, $offset, 4);
            $payload = substr($buffer, $offset + 4, $payloadLength);
            $frameLength = $offset + 4 + $payloadLength;
            $this->buffers[$connectionId] = substr($buffer, $frameLength);

            $text = '';
            for ($i = 0; $i < $payloadLength; $i++) {
                $text .= $payload[$i] ^ $mask[$i % 4];
            }

            if ($opcode === 8) {
                $this->disconnect($socket);
                break;
            }

            if ($opcode === 9) {
                $this->sendFrame($socket, $text, 10);
                continue;
            }

            if ($opcode !== 1) {
                continue;
            }

            $messages[] = $text;
        }

        return $messages;
    }

    private function encodeFrame(string $text, int $opcode = 1): string
    {
        $length = strlen($text);
        $head = chr(128 | ($opcode & 15));

        if ($length <= 125) {
            return $head . chr($length) . $text;
        }

        if ($length <= 65535) {
            return $head . chr(126) . pack('n', $length) . $text;
        }

        $high = intdiv($length, 4294967296);
        $low = $length % 4294967296;
        return $head . chr(127) . pack('N2', $high, $low) . $text;
    }
}
