# app/settings.py
import os
from typing import Optional
from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # -----------------------------
    # SERVIDOR PRINCIPAL / BRIDGE
    # -----------------------------
    BRIDGE_HOST: str = os.getenv("BRIDGE_HOST", "0.0.0.0")
    BRIDGE_PORT: int = int(os.getenv("BRIDGE_PORT", "8087"))
    BRIDGE_DEBUG: bool = os.getenv("BRIDGE_DEBUG", "false").lower() == "true"
    ACCESS_LOG: bool = os.getenv("ACCESS_LOG", "true").lower() == "true"

    # -----------------------------
    # CORS / UI
    # -----------------------------
    CORS_ALLOW_ORIGINS: str = os.getenv("CORS_ALLOW_ORIGINS", "*")
    GENIE_UI: str = os.getenv("GENIE_UI", "http://127.0.0.1:3000")

    # -----------------------------
    # GENIEACS ENDPOINTS
    # -----------------------------
    GENIE_NBI: str = os.getenv("GENIE_NBI", "http://127.0.0.1:7557")
    GENIE_FS: str = os.getenv("GENIE_FS", "http://127.0.0.1:7567")
    GENIE_CWMP: str = os.getenv("GENIE_CWMP", "http://127.0.0.1:7547")

    GENIE_CWMP_AUTH: bool = os.getenv("GENIE_CWMP_AUTH", "true").lower() == "true"
    GENIE_CWMP_USERNAME: str = os.getenv("GENIE_CWMP_USERNAME", "admin")
    GENIE_CWMP_PASSWORD: str = os.getenv("GENIE_CWMP_PASSWORD", "admin")

    # -----------------------------
    # IXC INTEGRAÇÃO
    # -----------------------------
    IXC_BASE_URL: AnyHttpUrl | str = os.getenv("IXC_BASE_URL", "")
    IXC_AUTH_HEADER_NAME: str = os.getenv("IXC_AUTH_HEADER_NAME", "Authorization")
    IXC_AUTH_HEADER_VALUE: str = os.getenv("IXC_AUTH_HEADER_VALUE", "")
    IXC_TOKEN_BASIC: str = os.getenv("IXC_TOKEN_BASIC", "")  # token cru: "6:abcdef..."
    IXC_TIMEOUT: int = int(os.getenv("IXC_TIMEOUT", "15"))
    IXC_VERIFY_SSL: bool = os.getenv("IXC_VERIFY_SSL", "true").lower() == "true"

    # -----------------------------
    # FASTAPI / METADADOS
    # -----------------------------
    APP_TITLE: str = "Semppre ACS"
    APP_VERSION: str = "1.2.0"

    # -----------------------------
    # PÚBLICO (usado no proxy p/ X-Forwarded-*)
    # -----------------------------
    PUBLIC_SCHEME: Optional[str] = os.getenv("PUBLIC_SCHEME")  # ex: https
    PUBLIC_HOST: Optional[str] = os.getenv("PUBLIC_HOST")      # ex: api.seu-dominio.com
    PUBLIC_PORT: Optional[int] = (
        int(os.getenv("PUBLIC_PORT")) if os.getenv("PUBLIC_PORT") else None
    )

    # -----------------------------
    # CONFIGURAÇÃO .ENV
    # -----------------------------
    # OpenAI / ChatGPT integration
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY", None)
    OPENAI_API_BASE: str = os.getenv("OPENAI_API_BASE", "https://api.openai.com")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


# Instância única para importar em outros módulos
settings = Settings()
