<?php
/**
 * Central config: loads .env, exposes DB + LLM settings.
 * Never require this from any client-facing (JS-served) file.
 */

declare(strict_types=1);

function onma_load_env(string $path): void
{
    if (!is_file($path)) {
        return;
    }

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        if (!str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value, " \t\n\r\0\x0B\"'");
        if ($key !== '' && getenv($key) === false) {
            putenv("$key=$value");
            $_ENV[$key] = $value;
        }
    }
}

onma_load_env(__DIR__ . '/../.env');

function onma_env(string $key, ?string $default = null): ?string
{
    $value = getenv($key);
    return $value === false ? $default : $value;
}

return [
    'app_env' => onma_env('APP_ENV', 'production'),
    'db' => [
        'host' => onma_env('DB_HOST', '127.0.0.1'),
        'port' => onma_env('DB_PORT', '3306'),
        'name' => onma_env('DB_NAME', 'chatbot_v1'),
        'user' => onma_env('DB_USER', 'root'),
        'pass' => onma_env('DB_PASS', ''),
    ],
    'llm' => [
        // Provider-specific key, read only server-side. Never echo this value
        // or include it in any response body / log line.
        'api_key' => onma_env('LLM_API_KEY', ''),
        'provider' => onma_env('LLM_PROVIDER', 'openai'),
        'model' => onma_env('LLM_MODEL', 'gpt-4o-mini'),
        'endpoint' => onma_env('LLM_ENDPOINT', 'https://api.openai.com/v1/chat/completions'),
    ],
    'chat' => [
        'max_message_length' => 1000,
        'rate_limit_per_minute' => 12,
    ],
];
