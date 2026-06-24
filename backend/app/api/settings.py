"""设置相关 API 路由"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.settings import Settings

router = APIRouter(tags=["settings"])


class SettingItem(BaseModel):
    key: str = Field(..., max_length=100)
    value: str | None = None
    description: str | None = Field(None, max_length=500)


class SettingsUpdate(BaseModel):
    settings: list[SettingItem]


class SettingResponse(BaseModel):
    key: str
    value: str | None = None
    description: str | None = None


def mask_api_key(key: str, value: str | None) -> str | None:
    """隐藏API Key，只显示前几位和后几位"""
    if not value or "KEY" not in key.upper():
        return value
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}...{value[-4:]}"


@router.get("/settings", response_model=list[SettingResponse])
async def get_settings(db: AsyncSession = Depends(get_db)):
    """获取所有设置"""
    result = await db.execute(select(Settings))
    settings = result.scalars().all()
    return [
        SettingResponse(
            key=s.key,
            value=mask_api_key(s.key, s.value),
            description=s.description,
        )
        for s in settings
    ]


@router.put("/settings", response_model=list[SettingResponse])
async def update_settings(body: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    """批量更新设置"""
    updated = []
    for item in body.settings:
        result = await db.execute(select(Settings).where(Settings.key == item.key))
        setting = result.scalar_one_or_none()

        if setting:
            # 如果是API Key且值为空，保留原值
            if item.value is not None:
                if "KEY" in item.key.upper() and item.value.strip() == "":
                    # 保留原值，不更新
                    pass
                else:
                    setting.value = item.value
            if item.description is not None:
                setting.description = item.description
        else:
            setting = Settings(
                key=item.key,
                value=item.value,
                description=item.description,
            )
            db.add(setting)

        updated.append(setting)

    await db.commit()

    return [
        SettingResponse(
            key=s.key,
            value=mask_api_key(s.key, s.value),
            description=s.description,
        )
        for s in updated
    ]


@router.get("/settings/{key}", response_model=SettingResponse)
async def get_setting(key: str, db: AsyncSession = Depends(get_db)):
    """获取单个设置"""
    result = await db.execute(select(Settings).where(Settings.key == key))
    setting = result.scalar_one_or_none()

    if not setting:
        raise HTTPException(status_code=404, detail=f"设置 '{key}' 不存在")

    return SettingResponse(
        key=setting.key,
        value=mask_api_key(setting.key, setting.value),
        description=setting.description,
    )


@router.put("/settings/{key}", response_model=SettingResponse)
async def update_setting(key: str, body: SettingItem, db: AsyncSession = Depends(get_db)):
    """更新单个设置"""
    result = await db.execute(select(Settings).where(Settings.key == key))
    setting = result.scalar_one_or_none()

    if setting:
        # 如果是API Key且值为空，保留原值
        if body.value is not None:
            if "KEY" in key.upper() and body.value.strip() == "":
                # 保留原值，不更新
                pass
            else:
                setting.value = body.value
        if body.description is not None:
            setting.description = body.description
    else:
        setting = Settings(
            key=key,
            value=body.value,
            description=body.description,
        )
        db.add(setting)

    await db.commit()

    return SettingResponse(
        key=setting.key,
        value=mask_api_key(setting.key, setting.value),
        description=setting.description,
    )
