# ADR 0001: Implicit Section-Transcript Alignment

## Status
Accepted

## Context
课记 generates structured course notes by sending speech-recognition transcripts to an LLM. The LLM produces note **sections** — timestamped Markdown blocks that map to time ranges in the source video. We considered two ways to link sections back to their source transcript segments:

- **Implicit** — sections carry only `start`/`end` timestamps; the UI uses time-range overlap to find the corresponding transcript segment
- **Explicit** — each section carries `source_indices: [3, 4, 5]` pointing to the transcript segments it was derived from

## Decision
We chose **implicit alignment** (timestamps only).

## Rationale
- Adding source indices to the LLM prompt increases output complexity and failure modes (the LLM must count segments correctly)
- The existing similarity-matching fallback (`_match_segments_by_similarity`) already handles cases where the LLM fails to produce valid sections at all
- Time-range overlap is simple to implement in the frontend and works for both forward (note→transcript) and reverse (transcript→note) lookup
- The primary use case — clicking a note section to jump the video, or seeing the active section highlighted during playback — only needs timestamps, not segment indices

## Consequences
- If the LLM assigns inaccurate timestamps, there is no per-section fallback; the entire sections array falls back to similarity matching
- Debugging timestamp accuracy requires manual comparison of sections against the raw transcript
