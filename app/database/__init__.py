# app/database/__init__.py
# Módulo de persistência - SQLite/PostgreSQL

from .connection import get_db, init_db, engine, SessionLocal
from .models import (
    Base,
    Device,
    DeviceMetric,
    DiagnosticLog,
    WifiSnapshot,
    ClientSession,
    AlertEvent,
    TaskHistory,
    DeviceConfigBackup,
    DeviceBootstrapEvent
)

__all__ = [
    "get_db",
    "init_db", 
    "engine",
    "SessionLocal",
    "Base",
    "Device",
    "DeviceMetric",
    "DiagnosticLog",
    "WifiSnapshot",
    "ClientSession",
    "AlertEvent",
    "TaskHistory",
    "DeviceConfigBackup",
    "DeviceBootstrapEvent"
]
