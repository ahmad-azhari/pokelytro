from motor.motor_asyncio import AsyncClient, AsyncDatabase
from config.settings import settings
from typing import Optional


class MongoDBConnection:
    _client: Optional[AsyncClient] = None
    _database: Optional[AsyncDatabase] = None

    @classmethod
    async def connect_to_database(cls) -> None:
        cls._client = AsyncClient(settings.mongodb_uri)
        cls._database = cls._client[settings.mongodb_database]
        await cls._client.admin.command("ping")

    @classmethod
    async def close_database_connection(cls) -> None:
        if cls._client:
            cls._client.close()

    @classmethod
    def get_database(cls) -> AsyncDatabase:
        if cls._database is None:
            raise RuntimeError("Database not connected. Call connect_to_database first.")
        return cls._database

    @classmethod
    def get_client(cls) -> AsyncClient:
        if cls._client is None:
            raise RuntimeError("Database client not initialized. Call connect_to_database first.")
        return cls._client
