<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/soap/MessengerSoapService.php';

$wsdlPath = __DIR__ . '/messenger.wsdl';

if (isset($_GET['wsdl'])) {
    header('Content-Type: text/xml; charset=utf-8');
    readfile($wsdlPath);
    exit;
}

function soap_text(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_XML1 | ENT_COMPAT, 'UTF-8');
}

function soap_bool(mixed $value): string
{
    return $value ? 'true' : 'false';
}

function soap_array_to_xml(array $data): string
{
    $xml = '';

    foreach ($data as $key => $value) {
        $name = preg_replace('/[^A-Za-z0-9_]/', '', (string) $key);
        if ($name === '') {
            $name = 'item';
        }

        if (is_array($value)) {
            $isList = array_keys($value) === range(0, count($value) - 1);
            if ($isList) {
                $xml .= '<' . $name . '>';
                foreach ($value as $item) {
                    $xml .= '<item>' . (is_array($item) ? soap_array_to_xml($item) : soap_text($item)) . '</item>';
                }
                $xml .= '</' . $name . '>';
            } else {
                $xml .= '<' . $name . '>' . soap_array_to_xml($value) . '</' . $name . '>';
            }
            continue;
        }

        if (is_bool($value)) {
            $xml .= '<' . $name . '>' . soap_bool($value) . '</' . $name . '>';
            continue;
        }

        if ($value === null) {
            $xml .= '<' . $name . '/>';
            continue;
        }

        $xml .= '<' . $name . '>' . soap_text($value) . '</' . $name . '>';
    }

    return $xml;
}

function soap_response(string $method, array $data): void
{
    header('Content-Type: text/xml; charset=utf-8');
    echo '<?xml version="1.0" encoding="UTF-8"?>';
    echo '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://localhost/webdialog/messenger">';
    echo '<soapenv:Body>';
    echo '<tns:' . soap_text($method) . 'Response><return>';
    echo soap_array_to_xml($data);
    echo '</return></tns:' . soap_text($method) . 'Response>';
    echo '</soapenv:Body></soapenv:Envelope>';
}

function soap_fault(string $message): void
{
    http_response_code(500);
    header('Content-Type: text/xml; charset=utf-8');
    echo '<?xml version="1.0" encoding="UTF-8"?>';
    echo '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">';
    echo '<soapenv:Body><soapenv:Fault>';
    echo '<faultcode>Server</faultcode><faultstring>' . soap_text($message) . '</faultstring>';
    echo '</soapenv:Fault></soapenv:Body></soapenv:Envelope>';
}

function first_xpath_node(DOMXPath $xpath, string $query, ?DOMNode $context = null): ?DOMNode
{
    $nodes = $context ? $xpath->query($query, $context) : $xpath->query($query);
    if ($nodes === false || $nodes->length === 0) {
        return null;
    }

    return $nodes->item(0);
}

function request_value(DOMXPath $xpath, DOMNode $methodNode, string $name): string
{
    $node = first_xpath_node($xpath, './*[local-name()="' . $name . '"]', $methodNode);
    return $node ? trim($node->textContent) : '';
}

// SOAP используется для обычных запросов: вход, регистрация, пользователи и история.
try {
    $rawBody = file_get_contents('php://input') ?: '';
    $xml = new DOMDocument();
    $xml->preserveWhiteSpace = false;

    if (trim($rawBody) === '' || !$xml->loadXML($rawBody)) {
        soap_fault('Некорректный SOAP-запрос');
        exit;
    }

    $xpath = new DOMXPath($xml);
    $methodNode = first_xpath_node($xpath, '/*[local-name()="Envelope"]/*[local-name()="Body"]/*[1]');

    if (!$methodNode instanceof DOMElement) {
        soap_fault('SOAP-метод не найден');
        exit;
    }

    $method = $methodNode->localName;
    $service = new MessengerSoapService(new AppServices());

    $result = match ($method) {
        'Register' => $service->Register(
            request_value($xpath, $methodNode, 'name'),
            request_value($xpath, $methodNode, 'email'),
            request_value($xpath, $methodNode, 'password')
        ),
        'Login' => $service->Login(
            request_value($xpath, $methodNode, 'email'),
            request_value($xpath, $methodNode, 'password')
        ),
        'Logout' => $service->Logout(
            request_value($xpath, $methodNode, 'token')
        ),
        'GetCurrentUser' => $service->GetCurrentUser(
            request_value($xpath, $methodNode, 'token')
        ),
        'GetUsers' => $service->GetUsers(
            request_value($xpath, $methodNode, 'token')
        ),
        'GetMessages' => $service->GetMessages(
            request_value($xpath, $methodNode, 'token'),
            (int) request_value($xpath, $methodNode, 'otherUserId'),
            (int) (request_value($xpath, $methodNode, 'limit') ?: 50)
        ),
        default => ['success' => false, 'message' => 'Неизвестный SOAP-метод'],
    };

    soap_response($method, $result);
} catch (Throwable $exception) {
    soap_fault($exception->getMessage());
}
