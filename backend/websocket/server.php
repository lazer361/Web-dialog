<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/websocket/WebSocketServer.php';

$host = getenv('WS_HOST') ?: '0.0.0.0';
$port = (int) (getenv('WS_PORT') ?: 8080);
$services = new AppServices();
$server = new WebSocketServer($host, $port, $services->auth, $services->messageService);
$server->run();
