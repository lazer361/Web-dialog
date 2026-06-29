Web Dialog

Web-приложение для обмена личными сообщениями.

Состав проекта:
- frontend — страницы, стили и клиентские скрипты;
- backend — серверная часть на PHP;
- docker — конфигурация окружения;
- docker-compose.yml — запуск приложения и базы данных.

Используемые технологии:
- HTML;
- Tailwind CSS;
- JavaScript;
- PHP;
- PDO;
- SOAP/WSDL;
- WebSocket;
- MariaDB;
- Docker Compose;
- nginx.

Запуск:
1. Запустить Docker Desktop.
2. Открыть start.bat.
3. Дождаться запуска контейнеров.
4. Открыть http://127.0.0.1:8000. Если порт занят старым Docker-контейнером, start.bat остановит его автоматически.

Остановка:
- открыть stop.bat.

Основные адреса:
- http://127.0.0.1:8000
- http://127.0.0.1:8000/api/soap.php
- http://127.0.0.1:8000/api/messenger.wsdl
