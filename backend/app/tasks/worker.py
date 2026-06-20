"""Celery 应用实例"""

from celery import Celery
from celery.signals import worker_init

from app.config import settings

# 创建 Celery 应用
celery_app = Celery(
    "keji",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.pipeline"],
)

# 可选配置
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,  # 长任务不抢占
    result_expires=3600,           # 结果过期 1 小时
)


@worker_init.connect
def on_worker_init(sender=None, **kwargs):
    """Worker 启动时初始化数据库表（确保表存在）。"""
    from app.database import init_db_sync

    init_db_sync()
