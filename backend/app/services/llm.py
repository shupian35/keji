"""大模型笔记生成服务"""

import json
import logging
import re

from openai import BadRequestError, OpenAI

from app.config import settings
from app.settings_utils import get_setting_value_sync

logger = logging.getLogger(__name__)

# ─── Prompt 模板 ───────────────────────────────────────

SYSTEM_PROMPT = (
    "你是一个精确的 JSON 输出机器，同时你也是一位专业的课程笔记整理专家。"
    "请严格按照要求输出 JSON，不要添加任何多余文字或 Markdown 代码块。"
)

NOTE_GENERATION_PROMPT = """你是一个专业的课程笔记整理助手。请根据以下课堂录音转写文本，生成详细的课程笔记。

## 要求

### 笔记内容
1. 使用 Markdown 格式，包含课程标题、目录、详细内容、重点总结
2. 笔记应该比原始转写更精炼，去掉口语化的重复和填充词，保留核心知识点
3. 分段要自然，每个段落覆盖一个完整知识点或话题单元

### 输出格式（严格 JSON）
{{
  "title": "课程标题",
  "markdown_content": "完整的 Markdown 笔记全文"
}}

注意：
- 只需要返回 title 和 markdown_content，不需要 segments 字段
- markdown_content 应该是完整的课程笔记内容

【转写文本】
{transcript_json}"""


def _build_prompt(
    transcript_segments: list[dict],
    screenshot_descriptions: list[dict] | None = None,
) -> str:
    """构建发送给 LLM 的完整 prompt。"""
    # 将转写片段合并为完整文本
    transcript_text = "\n".join(seg.get("text", "") for seg in transcript_segments)

    # 截断过长的转写文本（保留开头和结尾）
    max_transcript_chars = 30000
    original_len = len(transcript_text)
    if original_len > max_transcript_chars:
        head_size = int(max_transcript_chars * 0.6)
        tail_size = int(max_transcript_chars * 0.4)
        transcript_text = (
            transcript_text[:head_size]
            + "\n\n... (中间省略) ...\n\n"
            + transcript_text[-tail_size:]
        )
        logger.warning("转写文本过长 (%d 字符)，已截断至 %d 字符", original_len, len(transcript_text))

    prompt = NOTE_GENERATION_PROMPT.format(transcript_json=transcript_text)

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


def _validate_and_normalize(result: dict) -> dict:
    """验证并规范化 LLM 返回的结果。"""
    # ── 补充缺失字段 ──
    if "title" not in result:
        result["title"] = "课程笔记"
    if "markdown_content" not in result:
        if "content_md" in result:
            result["markdown_content"] = result["content_md"]
        else:
            result["markdown_content"] = ""

    # 移除 segments 字段（不再需要）
    result.pop("segments", None)

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
            [{"text": str}, ...]
        screenshot_descriptions: 可选，定时截帧的画面描述

    Returns:
        dict: {title, markdown_content}
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
    result = _validate_and_normalize(result)

    logger.info(
        "笔记生成完成: title=%s, md=%d 字符",
        result.get("title", ""),
        len(result.get("markdown_content", "")),
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
