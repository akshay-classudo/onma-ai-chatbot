<?php

declare(strict_types=1);

/**
 * Shared setup for every /api/*.php endpoint. Not directly reachable
 * (no HTTP verb handling of its own) — always required by the endpoint files.
 */

spl_autoload_register(function (string $class): void {
    $prefix = 'Chatbot\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $path = __DIR__ . '/../src/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

$config = require __DIR__ . '/../config/config.php';

if ($config['app_env'] !== 'production') {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    ini_set('display_errors', '0');
}

function onma_anonymize_ip(string $ip): ?string
{
    if ($ip === '') {
        return null;
    }

    if (str_contains($ip, '.')) {
        $parts = explode('.', $ip);
        if (count($parts) === 4) {
            $parts[3] = '0';
            return implode('.', $parts);
        }
    }

    if (str_contains($ip, ':')) {
        $parts = explode(':', $ip);
        return implode(':', array_slice($parts, 0, 4)) . '::';
    }

    return null;
}

function onma_log_error(string $context, \Throwable $e): void
{
    $line = sprintf(
        '[%s] %s: %s in %s:%d',
        date('Y-m-d H:i:s'),
        $context,
        $e->getMessage(),
        $e->getFile(),
        $e->getLine()
    );
    error_log($line . PHP_EOL, 3, __DIR__ . '/../storage/logs/app.log');
}
