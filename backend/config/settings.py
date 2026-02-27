from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    valyu_api_key: str = ""
    firecrawl_api_key: str = ""
    supabase_url: str = ""
    supabase_key: str = ""

    class Config:
        env_file = ".env"
