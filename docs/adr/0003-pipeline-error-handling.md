# ADR 0003: Pipeline Error Handling Strategy

## Status
Accepted

## Context
The `process_video` Celery task invokes multiple external dependencies: ffmpeg (local subprocess), SiliconFlow SenseVoice API (cloud transcription), and an LLM API over the network. Failures can be permanent (missing ffmpeg binary, invalid API key, corrupt video) or transient (network timeout, API rate-limit).

The initial implementation used `max_retries=1` and treated all failures identically, marking the video as `failed` and requiring manual retry.

## Decision
- **Transient errors**: Celery auto-retries up to 3 times with 30-second exponential backoff
- **Permanent errors**: The LLM service classifies HTTP 401 (unauthorized) and 400 (bad request) as non-retryable, raising a specific exception that skips Celery retry
- **Other errors**: Default to retryable (network timeouts, 429 rate-limit, 5xx server errors)

## Rationale
- Manual retry is poor UX for transient issues that resolve within seconds
- Automatically retrying auth failures (e.g., wrong API key) wastes resources and delays feedback
- The boundary between transient and permanent is clearest at the LLM API layer (HTTP status codes), not at the pipeline orchestration layer

## Consequences
- The `llm.py` module needs an exception hierarchy (`PermanentError` / `TransientError`)
- The Celery task decorator changes from `max_retries=1` to `max_retries=3` with `autoretry_for` and `retry_backoff`
- ffmpeg failures are always treated as permanent (they won't resolve by waiting)
