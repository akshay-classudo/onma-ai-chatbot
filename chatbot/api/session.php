<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

use Chatbot\Database\Db;
use Chatbot\Database\SessionRepository;

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

try {
    $db = Db::connection($config['db']);
    $sessions = new SessionRepository($db);

    $sessionToken = bin2hex(random_bytes(32));
    $ipPartial = onma_anonymize_ip($_SERVER['REMOTE_ADDR'] ?? '');

    $sessions->create($sessionToken, $ipPartial);

    echo json_encode(['session_token' => $sessionToken]);
} catch (\Throwable $e) {
    onma_log_error('session.php', $e);
    http_response_code(500);
    echo json_encode(['error' => 'internal_error']);
}
