# 转写性能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make audio-to-text transcription 3-10x faster via model downgrade, GPU auto-detection, and parameter tuning.

**Architecture:** Modify `Transcriber` class to auto-detect GPU, default to `medium` model, and tune faster-whisper parameters. No manual audio splitting needed — faster-whisper's built-in `chunk_length` handles long audio internally.

**Tech Stack:** faster-whisper, pydantic-settings, ffmpeg

---

### Task 1: Config — new env vars + model default change

**Covers:** Model size default, GPU auto-detect, chunk length config

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add new settings fields**

Add after `whisper_compute_type` (line 24):

```python
whisper_chunk_length: int | None = None
whisper_beam_size: int = 5
```

Change `whisper_model_size` default from `"large-v3"` to `"medium"` (line 21).

- [ ] **Step 2: Add auto-detect device helper**

Add after `get_media_path` method (before `settings = Settings()`):

```python
    def get_whisper_device(self) -> str:
        """Auto-detect best available device for whisper."""
        if self.whisper_device != "auto":
            return self.whisper_device
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
        except ImportError:
            pass
        return "cpu"

    def get_whisper_compute_type(self) -> str:
        """Override compute_type based on actual device."""
        device = self.get_whisper_device()
        if device == "cuda" and self.whisper_compute_type == "int8":
            return "float16"
        return self.whisper_compute_type
```

- [ ] **Step 3: Update .env.example**

Add to `backend/.env.example`:

```
WHISPER_MODEL_SIZE=medium
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=int8
WHISPER_CHUNK_LENGTH=
WHISPER_BEAM_SIZE=5
```

- [ ] **Step 4: Verify syntax**

Run: `py -m py_compile app/config.py`
Expected: no output (success)

---

### Task 2: Transcriber — use new config + tuned params

**Covers:** GPU auto-detect usage, parameter tuning, chunk_length

**Files:**
- Modify: `backend/app/services/transcriber.py`

- [ ] **Step 1: Update __init__ to use auto-detect**

Replace `__init__` (lines 24-33):

```python
    def __init__(
        self,
        model_size: str | None = None,
        device: str | None = None,
        compute_type: str | None = None,
    ):
        self.model_size = model_size or settings.whisper_model_size
        self._device_override = device
        self._compute_type_override = compute_type
        self.model = None

    @property
    def device(self) -> str:
        return self._device_override or settings.get_whisper_device()

    @property
    def compute_type(self) -> str:
        return self._compute_type_override or settings.get_whisper_compute_type()
```

- [ ] **Step 2: Update _load_model with logging**

Replace `_load_model` (lines 35-54):

```python
    def _load_model(self):
        if self.model is not None:
            return

        logger.info(
            "加载 faster-whisper 模型: model=%s, device=%s, compute_type=%s",
            self.model_size,
            self.device,
            self.compute_type,
        )

        from faster_whisper import WhisperModel

        self.model = WhisperModel(
            self.model_size,
            device=self.device,
            compute_type=self.compute_type,
        )
        logger.info("faster-whisper 模型加载完成")
```

- [ ] **Step 3: Tune transcribe parameters**

Replace the `self.model.transcribe(...)` call (lines 77-83):

```python
        segments, info = self.model.transcribe(
            audio_path,
            language=language,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200,
            ),
            word_timestamps=False,
            beam_size=settings.whisper_beam_size,
            chunk_length=settings.whisper_chunk_length,
            condition_on_previous_text=True,
            no_speech_threshold=0.6,
        )
```

- [ ] **Step 4: Verify syntax**

Run: `py -m py_compile app/services/transcriber.py`
Expected: no output (success)

---

### Task 3: Pipeline — pass beam_size through & log device

**Covers:** Ensure pipeline uses optimized transcriber

**Files:**
- Modify: `backend/app/tasks/pipeline.py:104-119`

- [ ] **Step 1: Add device info to pipeline log**

Replace the transcribe block (lines 104-119):

```python
        # ── 步骤 3: 语音转写 ────────────────────────
        _progress(0.15, "语音识别中（可能需要几分钟）...")

        from app.services.transcriber import get_transcriber

        transcriber = get_transcriber()
        logger.info(
            "转写配置: model=%s, device=%s, compute_type=%s",
            transcriber.model_size, transcriber.device, transcriber.compute_type,
        )
        transcript_segments = transcriber.transcribe(str(audio_path), language="zh")

        if not transcript_segments:
            raise ValueError("语音转写结果为空，请检查音频是否包含有效语音")

        logger.info(
            "转写完成: %d 个片段, 总时长 %.0fs",
            len(transcript_segments),
            transcript_segments[-1]["end"] if transcript_segments else 0,
        )
```

- [ ] **Step 2: Verify syntax**

Run: `py -m py_compile app/tasks/pipeline.py`
Expected: no output (success)

---

### Task 4: Docker — update env defaults

**Covers:** Docker deployment uses new defaults

**Files:**
- Modify: `docker-compose.yml:23-25, 51-53`

- [ ] **Step 1: Update api service env**

Change `WHISPER_MODEL_SIZE` default from `large-v3` to `medium` (line 23).

- [ ] **Step 2: Update worker service env**

Change `WHISPER_MODEL_SIZE` default from `large-v3` to `medium` (line 51).

- [ ] **Step 3: Add new env vars to both services**

Add after `WHISPER_COMPUTE_TYPE` in both api and worker:

```yaml
          - WHISPER_CHUNK_LENGTH=${WHISPER_CHUNK_LENGTH:-}
          - WHISPER_BEAM_SIZE=${WHISPER_BEAM_SIZE:-5}
```

---

### Task 5: Verify — end-to-end smoke test

**Covers:** All changes work together

**Files:**
- None (verification only)

- [ ] **Step 1: Syntax check all modified files**

```bash
cd backend && py -m py_compile app/config.py && py -m py_compile app/services/transcriber.py && py -m py_compile app/tasks/pipeline.py && echo "ALL OK"
```

- [ ] **Step 2: Import check**

```bash
cd backend && py -c "from app.config import settings; print('device:', settings.get_whisper_device()); print('compute_type:', settings.get_whisper_compute_type()); print('model:', settings.whisper_model_size)"
```

Expected: prints device (cpu or cuda), compute_type, model (medium).
