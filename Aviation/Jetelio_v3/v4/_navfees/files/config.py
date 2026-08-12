"""Application configuration settings."""

from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # API Configuration
    API_HOST: str = Field(default="0.0.0.0", env="API_HOST")
    API_PORT: int = Field(default=8000, env="API_PORT")
    DEBUG: bool = Field(default=False, env="DEBUG")
    
    # CORS Configuration
    CORS_ORIGINS: List[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:8000",
        ],
        env="CORS_ORIGINS"
    )
    
    # Database
    DATABASE_URL: str = Field(
        default="postgresql://user:password@localhost:5432/jetelio_nav",
        env="DATABASE_URL"
    )
    
    # Jetelio Integration
    JETELIO_API_BASE: str = Field(
        default="http://localhost:8001",
        env="JETELIO_API_BASE",
        description="Jetelio v4 main API base URL"
    )
    JETELIO_API_KEY: str = Field(
        default="dev-key",
        env="JETELIO_API_KEY"
    )
    JETELIO_MARGIN_PERCENT: float = Field(
        default=15.0,
        env="JETELIO_MARGIN_PERCENT",
        description="Jetelio platform margin on nav fees (percent)"
    )
    
    # Wind Data & Weather Services
    OPENMETEO_API_KEY: str = Field(
        default="",
        env="OPENMETEO_API_KEY",
        description="Open-Meteo API key (free tier available)"
    )
    ENABLE_WIND_OPTIMIZATION: bool = Field(
        default=True,
        env="ENABLE_WIND_OPTIMIZATION"
    )
    
    # Data Sources
    EXCEL_DATA_PATH: str = Field(
        default="./data/ans_providers.xlsx",
        env="EXCEL_DATA_PATH",
        description="Path to ANS provider data Excel file"
    )
    FIR_GEOJSON_PATH: str = Field(
        default="./data/fir_boundaries.geojson",
        env="FIR_GEOJSON_PATH"
    )
    USE_POSTGIS: bool = Field(
        default=False,
        env="USE_POSTGIS",
        description="Use PostGIS for FIR geometry instead of GeoJSON"
    )
    
    # Fee Calculation Defaults
    DEFAULT_CURRENCY: str = Field(default="USD", env="DEFAULT_CURRENCY")
    VAT_RATE_PERCENT: float = Field(
        default=0.0,
        env="VAT_RATE_PERCENT",
        description="VAT/GST to apply to fees (if required by region)"
    )
    
    # Caching
    ENABLE_CACHE: bool = Field(default=True, env="ENABLE_CACHE")
    CACHE_TTL_SECONDS: int = Field(default=3600, env="CACHE_TTL_SECONDS")
    
    # Logging
    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    LOG_FILE: str = Field(default="./logs/jetelio_nav.log", env="LOG_FILE")
    
    # Rate Limiting
    ENABLE_RATE_LIMITING: bool = Field(default=True, env="ENABLE_RATE_LIMITING")
    REQUESTS_PER_MINUTE: int = Field(default=60, env="REQUESTS_PER_MINUTE")
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()
