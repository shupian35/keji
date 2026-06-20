# ADR 0004: Manual Language Selection

## Status
Accepted

## Context
The app generates notes from course videos. Courses may be in Chinese, English, or other languages. The transcription service (SiliconFlow SenseVoice) auto-detects language, but the LLM prompt template and the generated note's output language must match the course language. Three options were considered:

- **A**: Always Chinese (hardcoded)
- **B**: Auto-detect from transcription output, switch prompt automatically
- **C**: User selects language manually at upload time

## Decision
We chose **manual language selection** (option C). The user selects the course language in a dropdown on the upload page.

## Rationale
- Users know their course language with 100% certainty — no need for auto-detection
- Auto-detection (option B) ties the prompt language to the whisper output, but the user may want notes in a different language than the spoken course language
- A dropdown with 2-3 common options (Chinese, English) adds minimal UI friction
- The language parameter controls which LLM prompt template is used

## Consequences
- The upload form needs a language dropdown (default: Chinese)
- The `language` field must be stored on the Video record and passed through the pipeline
- Two sets of LLM prompts are needed (Chinese and English). Additional languages can be added later.
