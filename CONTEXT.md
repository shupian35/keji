# CONTEXT — 课记 (Course AI Notes)

## Glossary

### Video
A source video file uploaded by the user. Stored as a file on disk, referenced by a `videos` database record. Has a processing lifecycle: `pending → processing → done | failed`. One Video produces at most one Note. Video ID doubles as the task ID for simplicity in MVP.

### Note
The AI-generated structured course note produced from a Video. Contains the full Markdown (`content_md`), an array of timestamped **sections**, and the raw transcript. Always has exactly one parent Video. `content_md` and sections are intentionally redundant — sections drive the interactive time-synced UI, while `content_md` serves as the clean Markdown source for export/download.

### Section (née "segment")
A timestamped block of the generated note. Each section has `start`/`end` (seconds) and `text` (Markdown). Sections are displayed individually in the UI, with bidirectional time-sync to the video player. Sections are implicitly linked to transcript segments via time-range overlap (see ADR 0001).

### Transcript Segment
A raw speech-recognition fragment from SiliconFlow SenseVoice API. Has `start`/`end` (seconds) and `text` (plain text). Transcript segments are the input to the LLM, which condenses them into note sections. Not rendered in the main note view; shown in a collapsible "raw transcript" panel.

### Processing Pipeline
The Celery async workflow that transforms a Video into a Note: extract audio (ffmpeg) → transcribe (SiliconFlow SenseVoice) → generate note (LLM) → persist. Progress is reported via Celery task state (Redis) and the Video database record. Transient failures (network, rate-limit) retry up to 3 times with exponential backoff; permanent failures (auth, corrupt file) fail immediately.

### Language Selection
The user chooses the course language at upload time via a dropdown. This controls which LLM prompt template is used. Supported: Chinese (zh), English (en). Default: Chinese.

### Upload
The act of submitting a video file for processing. Returns a task ID (same as video ID). If the Celery worker is unreachable at upload time, the video is saved in `pending` status and the frontend shows a warning that the processing service is unavailable.

### Export
Downloading a note as a standalone Markdown file (`.md`). Uses `content_md` directly — no timestamps in the exported file. PDF export is deferred to a later phase.
