"""大模型笔记生成服务"""

import json
import logging
import re
from difflib import SequenceMatcher

from openai import BadRequestError, OpenAI

from app.config import settings
from app.settings_utils import get_setting_value_sync

logger = logging.getLogger(__name__)

# ─── Prompt 模板 ───────────────────────────────────────

SYSTEM_PROMPT = (
    "你是一个精确的 JSON 输出机器，同时你也是一位专业的课程笔记整理专家。"
    "请严格按照要求输出 JSON，不要添加任何多余文字或 Markdown 代码块。"
)

NOTE_GENERATION_PROMPT = """你是一个专业的课程笔记整理助手。请根据以下带时间戳的课堂录音转写文本，生成详细的课程笔记。

## 要求

### 笔记内容
1. 使用 Markdown 格式，包含课程标题、目录、详细内容、重点总结
2. 笔记应该比原始转写更精炼，去掉口语化的重复和填充词，保留核心知识点
3. 分段要自然，每个段落覆盖一个完整知识点或话题单元

### 时间戳对齐（非常重要！）
4. 为笔记中的每个自然段落分配精确的时间戳区间 [start, end]
5. start 和 end 必须来自下方转写片段中实际出现的时间范围
6. 每个笔记段落需要对应到讲解该知识点的转写时间区间，你务必仔细核对
7. segments 数组必须覆盖 markdown_content 中的全部内容，无遗漏无重叠，按时间升序

### 输出格式（严格 JSON）
{{
  "title": "课程标题",
  "markdown_content": "完整的 Markdown 笔记全文",
  "segments": [
    {{
      "start": 0.0,
      "end": 120.5,
      "text": "这一段的笔记 Markdown，属于同一时间区间"
    }}
  ]
}}

注意：
- start/end 是浮点数，text 是段落 Markdown 字符串
- segments 中 text 的拼接应等于 markdown_content（允许仅存在空白符差异）
- 如果一个知识点跨越多个转写片段，请合并时间区间

【转写文本】
{transcript_json}"""


def _build_prompt(
    transcript_segments: list[dict],
    screenshot_descriptions: list[dict] | None = None,
) -> str:
    """构建发送给 LLM 的完整 prompt。"""
    transcript_json = json.dumps(transcript_segments, ensure_ascii=False, indent=2)

    # 截断过长的转写文本（保留开头和结尾）
    max_transcript_chars = 30000
    original_len = len(transcript_json)
    if original_len > max_transcript_chars:
        head_size = int(max_transcript_chars * 0.6)
        tail_size = int(max_transcript_chars * 0.4)
        transcript_json = (
            transcript_json[:head_size]
            + "\n\n... (中间省略) ...\n\n"
            + transcript_json[-tail_size:]
        )
        logger.warning("转写文本过长 (%d 字符)，已截断至 %d 字符", original_len, len(transcript_json))

    prompt = NOTE_GENERATION_PROMPT.format(transcript_json=transcript_json)

    if screenshot_descriptions:
        ss_json = json.dumps(screenshot_descriptions, ensure_ascii=False, indent=2)
        prompt += (
            "\n\n【画面描述（来自视频截图）】\n"
            + ss_json
            + "\n请结合画面内容丰富笔记中的视觉描述。"
        )

    return prompt


def _extract_json_from_response(text: str) -> dict:
    """从 LLM 响应中提取 JSON 对象（处理 markdown 代码块包裹等情况）。"""
    # 1. 直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. 从 ```json ... ``` 代码块中提取
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 3. 从第一个 { 到最后一个 } 提取
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"无法从 LLM 响应中解析 JSON: {text[:200]}...")


def _similarity(a: str, b: str) -> float:
    """计算两段文本的相似度 (0~1)。"""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _match_segments_by_similarity(
    note_md: str,
    transcript_segments: list[dict],
    min_segment_chars: int = 50,
) -> list[dict]:
    """
    回退方案：当 LLM 未返回有效 segments 时，通过文本相似度
    将 Markdown 笔记段落与转写片段匹配，估算时间戳。

    策略：
    1. 将 markdown_content 按双换行拆分段落
    2. 对每个笔记段落，在转写文本中找最相似的连续片段
    3. 用匹配到的转写片段的时间戳作为笔记段落的时间戳
    """
    # 按双换行拆分为笔记段落
    note_paragraphs = [p.strip() for p in note_md.split("\n\n") if len(p.strip()) >= min_segment_chars]
    if not note_paragraphs:
        return []

    # 把转写片段按时间窗口（30s）合并为更大的块，提高匹配准确性
    window_size = 30.0
    merged_transcripts: list[dict] = []
    current = {"start": transcript_segments[0]["start"], "end": 0.0, "text": ""}
    for seg in transcript_segments:
        if seg["start"] - current["start"] > window_size and current["text"].strip():
            merged_transcripts.append(current)
            current = {"start": seg["start"], "end": seg["end"], "text": seg["text"]}
        else:
            current["end"] = seg["end"]
            current["text"] += " " + seg["text"]
    if current["text"].strip():
        merged_transcripts.append(current)

    logger.info(
        "回退匹配: %d 个笔记段落 × %d 个转写合并块 (%d→%d)",
        len(note_paragraphs), len(merged_transcripts),
        len(transcript_segments), len(merged_transcripts),
    )

    segments: list[dict] = []
    for para in note_paragraphs:
        # 找最相似的转写块
        best = max(merged_transcripts, key=lambda t: _similarity(para, t["text"]))
        sim = _similarity(para, best["text"])
        segments.append({
            "start": best["start"],
            "end": best["end"],
            "text": para,
            "_match_score": round(sim, 2),
        })

    # 按时间排序
    segments.sort(key=lambda s: s["start"])

    logger.info(
        "回退匹配完成: %d 个段落, 平均相似度 %.2f",
        len(segments),
        sum(s.get("_match_score", 0) for s in segments) / max(len(segments), 1),
    )

    return segments


def _validate_and_normalize(result: dict, transcript_segments: list[dict]) -> dict:
    """验证并规范化 LLM 返回的结果。"""
    # ── 补充缺失字段 ──
    if "title" not in result:
        result["title"] = "课程笔记"
    if "markdown_content" not in result:
        if "content_md" in result:
            result["markdown_content"] = result["content_md"]
        else:
            result["markdown_content"] = ""

    # ── 确保 segments 有效 ──
    segments = result.get("segments", [])
    if not isinstance(segments, list):
        segments = []

    # 检查 segments 是否有足够的信息
    valid_segments = []
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        text = seg.get("text", "").strip()
        if not text:
            continue
        valid_segments.append({
            "start": float(seg.get("start", 0)),
            "end": float(seg.get("end", 0)),
            "text": text,
        })

    # ── 回退：segments 无有效数据时，用相似度匹配 ──
    if not valid_segments and result["markdown_content"] and transcript_segments:
        logger.warning("LLM 未返回有效 segments，启用文本相似度回退匹配")
        valid_segments = _match_segments_by_similarity(
            result["markdown_content"], transcript_segments
        )

    # ── 去重 _match_score 内部字段 ──
    result["segments"] = [
        {k: v for k, v in s.items() if k != "_match_score"}
        for s in valid_segments
    ]

    return result


# ─── 主入口 ──────────────────────────────────────────

def generate_notes_sync(
    transcript_segments: list[dict],
    screenshot_descriptions: list[dict] | None = None,
) -> dict:
    """
    调用 LLM 生成结构化课程笔记（同步版本，供 Celery Worker 使用）。

    Args:
        transcript_segments: 语音转写片段
            [{"start": float, "end": float, "text": str}, ...]
        screenshot_descriptions: 可选，定时截帧的画面描述

    Returns:
        dict: {title, markdown_content, segments: [{start, end, text}]}
    """
    # 优先从数据库读取配置，回退到环境变量
    llm_api_key = get_setting_value_sync("LLM_API_KEY", settings.llm_api_key)
    llm_base_url = get_setting_value_sync("LLM_BASE_URL", settings.llm_base_url)
    llm_model = get_setting_value_sync("LLM_MODEL", settings.llm_model)

    if not llm_api_key:
        raise ValueError("LLM_API_KEY 未配置，无法生成笔记")
    if not transcript_segments:
        raise ValueError("转写片段为空，无法生成笔记")

    prompt = _build_prompt(transcript_segments, screenshot_descriptions)

    client = OpenAI(
        api_key=llm_api_key,
        base_url=llm_base_url,
    )

    logger.info(
        "调用 LLM: model=%s, prompt=%d 字符, segments=%d 个",
        llm_model, len(prompt), len(transcript_segments),
    )

    # 尝试使用 json_object 模式（兼容 OpenAI / DeepSeek 等）
    try:
        response = client.chat.completions.create(
            model=llm_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=8192,
            response_format={"type": "json_object"},
        )
    except BadRequestError:
        # 仅当 API 明确拒绝 response_format 时回退（HTTP 400）
        logger.warning("response_format=json_object 不支持，回退到标准模式")
        response = client.chat.completions.create(
            model=llm_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=8192,
        )

    raw_content = response.choices[0].message.content or "{}"
    usage = response.usage
    logger.info(
        "LLM 返回: %d 字符, tokens: prompt=%d completion=%d",
        len(raw_content),
        usage.prompt_tokens if usage else 0,
        usage.completion_tokens if usage else 0,
    )

    result = _extract_json_from_response(raw_content)
    result = _validate_and_normalize(result, transcript_segments)

    logger.info(
        "笔记生成完成: title=%s, md=%d 字符, segments=%d 个",
        result.get("title", ""),
        len(result.get("markdown_content", "")),
        len(result.get("segments", [])),
    )

    return result


async def generate_notes(
    transcript_segments: list[dict],
    screenshot_descriptions: list[dict] | None = None,
) -> dict:
    """异步版本 — 在线程池中运行同步调用。"""
    import asyncio

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        generate_notes_sync,
        transcript_segments,
        screenshot_descriptions,
    )
