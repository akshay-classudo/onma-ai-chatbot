<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

use Chatbot\AI\LlmClient;
use Chatbot\Database\Db;
use Chatbot\Database\MessageRepository;
use Chatbot\Database\SessionRepository;

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);

$sessionToken = is_array($body) ? ($body['session_id'] ?? null) : null;
$message = is_array($body) ? ($body['message'] ?? null) : null;
$language = is_array($body) ? ($body['language'] ?? null) : null;
$language = in_array($language, ['de', 'en'], true) ? $language : 'de';

if (!is_string($sessionToken) || $sessionToken === '') {
    http_response_code(400);
    echo json_encode(['error' => 'missing_session_id']);
    exit;
}

if (!is_string($message) || trim($message) === '') {
    http_response_code(400);
    echo json_encode(['error' => 'empty_message']);
    exit;
}

$message = trim($message);
$maxLength = $config['chat']['max_message_length'];

if (mb_strlen($message) > $maxLength) {
    http_response_code(400);
    echo json_encode(['error' => 'message_too_long', 'max_length' => $maxLength]);
    exit;
}

try {
    $db = Db::connection($config['db']);
    $sessions = new SessionRepository($db);
    $messages = new MessageRepository($db);

    $session = $sessions->findByToken($sessionToken);
    if ($session === null) {
        http_response_code(404);
        echo json_encode(['error' => 'session_not_found']);
        exit;
    }
    $sessionId = (int) $session['id'];

    $recentCount = $sessions->countRecentMessagesForRateLimit($sessionId, 60);
    if ($recentCount >= $config['chat']['rate_limit_per_minute']) {
        http_response_code(429);
        echo json_encode(['error' => 'rate_limited']);
        exit;
    }

    $messages->add($sessionId, 'user', $message);

    $systemPrompts = require __DIR__ . '/../config/system_prompts.php';
    $systemPrompt = $systemPrompts[$language];
    $history = $messages->recentHistory($sessionId, 12);

    $llmMessages = [['role' => 'system', 'content' => $systemPrompt]];
    foreach ($history as $row) {
        $llmMessages[] = [
            'role' => $row['role'] === 'assistant' ? 'assistant' : 'user',
            'content' => $row['content'],
        ];
    }

    $llm = new LlmClient(
        $config['llm']['api_key'],
        $config['llm']['endpoint'],
        $config['llm']['model']
    );

    $fallbackReplies = [
        'de' => 'Entschuldigung, ich habe dazu momentan keine Information. Bitte kontaktieren Sie ONMA scout direkt, wir helfen Ihnen gerne persönlich weiter.',
        'en' => "Sorry, I don't have that information right now. Please contact ONMA scout directly — we're happy to help you in person.",
    ];

    try {
        $reply = $llm->chat($llmMessages);
    } catch (\Throwable $e) {
        onma_log_error('chat.php:llm', $e);
        $reply = $fallbackReplies[$language];
    }

    $messages->add($sessionId, 'assistant', $reply);

    echo json_encode(['reply' => $reply]);
} catch (\Throwable $e) {
    onma_log_error('chat.php', $e);
    http_response_code(500);
    echo json_encode(['error' => 'internal_error']);
}
