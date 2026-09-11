<?php

declare(strict_types=1);

namespace Chatbot\AI;

use RuntimeException;

/**
 * Thin wrapper around one LLM provider's chat-completions API.
 * Provider-specific request/response shape lives only here — swapping
 * providers (or moving to an EU-hosted one in V2) means editing this file
 * only, nothing in api/ or src/Database.
 */
final class LlmClient
{
    public function __construct(
        private string $apiKey,
        private string $endpoint,
        private string $model
    ) {
    }

    /**
     * @param array<int, array{role: string, content: string}> $messages
     */
    public function chat(array $messages): string
    {
        if ($this->apiKey === '') {
            throw new RuntimeException('LLM API key is not configured');
        }

        $payload = json_encode([
            'model' => $this->model,
            'messages' => $messages,
            'temperature' => 0.3,
            'max_tokens' => 500,
        ], JSON_THROW_ON_ERROR);

        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->apiKey,
        ];

        // Some environments (this project's local XAMPP install included —
        // Apache loads an older bundled OpenSSL that php_curl.dll can't
        // resolve against) have the openssl extension working fine but
        // ext-curl broken or missing. Fall back to PHP's own HTTPS stream
        // wrapper so the app keeps working either way.
        $response = function_exists('curl_init')
            ? $this->sendViaCurl($this->endpoint, $headers, $payload)
            : $this->sendViaStream($this->endpoint, $headers, $payload);

        $data = json_decode($response, true);
        $content = $data['choices'][0]['message']['content'] ?? null;

        if (!is_string($content) || $content === '') {
            throw new RuntimeException('LLM response missing content');
        }

        return trim($content);
    }

    private function sendViaCurl(string $url, array $headers, string $payload): string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 25,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new RuntimeException('LLM request failed: ' . $curlError);
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            throw new RuntimeException('LLM request returned HTTP ' . $httpCode . ': ' . $response);
        }

        return $response;
    }

    private function sendViaStream(string $url, array $headers, string $payload): string
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $headers),
                'content' => $payload,
                'timeout' => 25,
                'ignore_errors' => true,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);

        if ($response === false) {
            $error = error_get_last();
            throw new RuntimeException('LLM request failed: ' . ($error['message'] ?? 'unknown error'));
        }

        $statusCode = 0;
        if (isset($http_response_header[0]) && preg_match('#HTTP/\S+\s+(\d+)#', $http_response_header[0], $m)) {
            $statusCode = (int) $m[1];
        }

        if ($statusCode < 200 || $statusCode >= 300) {
            throw new RuntimeException('LLM request returned HTTP ' . $statusCode . ': ' . $response);
        }

        return $response;
    }
}
