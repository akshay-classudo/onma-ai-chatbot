"""
Thin wrapper around one LLM provider's chat-completions API.
Provider-specific request/response shape lives only here — swapping
providers (or moving to an EU-hosted one later) means editing this file only.
"""

import json

import requests
from django.conf import settings

FALLBACK_REPLIES = {
    "de": (
        "Entschuldigung, ich habe dazu momentan keine Information. Bitte "
        "kontaktieren Sie ONMA scout direkt, wir helfen Ihnen gerne "
        "persönlich weiter."
    ),
    "en": (
        "Sorry, I don't have that information right now. Please contact "
        "ONMA scout directly — we're happy to help you in person."
    ),
}


class LlmError(Exception):
    pass


def chat_completion(messages: list[dict]) -> str:
    if not settings.LLM_API_KEY:
        raise LlmError("LLM API key is not configured")

    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 500,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
    }

    try:
        response = requests.post(
            settings.LLM_ENDPOINT, json=payload, headers=headers, timeout=25
        )
    except requests.RequestException as exc:
        raise LlmError(f"LLM request failed: {exc}") from exc

    if not response.ok:
        raise LlmError(f"LLM request returned HTTP {response.status_code}: {response.text}")

    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise LlmError("LLM response missing content") from exc

    if not content:
        raise LlmError("LLM response missing content")

    return content.strip()


def stream_chat_completion(messages: list[dict]):
    """Generator yielding text deltas as they arrive (OpenAI-compatible SSE
    chat-completions streaming format: lines of `data: {...}`, terminated by
    `data: [DONE]`). Raises LlmError up front for anything that fails before
    the first byte — request setup, auth, HTTP status; once streaming has
    started, a malformed individual line is skipped rather than aborting the
    whole reply."""
    if not settings.LLM_API_KEY:
        raise LlmError("LLM API key is not configured")

    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 500,
        "stream": True,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
    }

    try:
        response = requests.post(
            settings.LLM_ENDPOINT, json=payload, headers=headers, timeout=60, stream=True
        )
    except requests.RequestException as exc:
        raise LlmError(f"LLM request failed: {exc}") from exc

    if not response.ok:
        raise LlmError(f"LLM request returned HTTP {response.status_code}: {response.text}")

    # requests defaults to Latin-1 for text/event-stream (no charset in the
    # response's Content-Type header), which silently mangles any non-ASCII
    # character — force UTF-8, since every OpenAI-compatible provider
    # actually sends UTF-8 regardless of what the header omits.
    response.encoding = "utf-8"

    for line in response.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"):
            continue

        data = line[len("data:"):].strip()
        if data == "[DONE]":
            break

        try:
            chunk = json.loads(data)
            content = chunk["choices"][0]["delta"].get("content")
        except (json.JSONDecodeError, KeyError, IndexError):
            continue

        if content:
            yield content


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not settings.LLM_API_KEY:
        raise LlmError("LLM API key is not configured")

    if not texts:
        return []

    payload = {"model": settings.EMBEDDING_MODEL, "input": texts}
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
    }

    try:
        response = requests.post(
            settings.EMBEDDING_ENDPOINT, json=payload, headers=headers, timeout=25
        )
    except requests.RequestException as exc:
        raise LlmError(f"Embedding request failed: {exc}") from exc

    if not response.ok:
        raise LlmError(f"Embedding request returned HTTP {response.status_code}: {response.text}")

    try:
        items = sorted(response.json()["data"], key=lambda item: item["index"])
        return [item["embedding"] for item in items]
    except (KeyError, IndexError, ValueError) as exc:
        raise LlmError("Embedding response missing data") from exc
