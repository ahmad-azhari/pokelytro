from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config.settings import settings
from repository.mongodb_connection import MongoDBConnection
from services.embedding_service import EmbeddingService
from api.routes.chatbot import chatbot_router
from api.routes.pokemon import pokemon_router
from api.routes.types import type_router
from api.routes.teams import team_router
from api.routes.users import user_router


@asynccontextmanager
async def lifespan_manager(api_instance: FastAPI):
    await MongoDBConnection.connect_to_database()
    EmbeddingService.initialize_embedding_model()
    yield
    await MongoDBConnection.close_database_connection()


def create_fastapi_application() -> FastAPI:
    fastapi_app = FastAPI(
        title=settings.project_name,
        description="Lytrobot RAG Pipeline - State-of-the-art Pokémon knowledge assistant",
        version="2.0.0",
        lifespan=lifespan_manager
    )

    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    fastapi_app.include_router(
        chatbot_router,
        prefix=f"{settings.api_v1_prefix}/chatbot",
        tags=["Chatbot"]
    )

    fastapi_app.include_router(
        pokemon_router,
        prefix=f"{settings.api_v1_prefix}/pokemons",
        tags=["Pokémon"]
    )

    fastapi_app.include_router(
        type_router,
        prefix=f"{settings.api_v1_prefix}/types",
        tags=["Types"]
    )

    fastapi_app.include_router(
        team_router,
        prefix=f"{settings.api_v1_prefix}/teams",
        tags=["Teams"]
    )

    fastapi_app.include_router(
        user_router,
        prefix=f"{settings.api_v1_prefix}/users",
        tags=["Users"]
    )

    @fastapi_app.get("/")
    async def health_check_endpoint() -> dict:
        return {"status": "ok", "service": "Lytrobot RAG Pipeline"}

    @fastapi_app.get("/api/health")
    async def api_health_check_endpoint() -> dict:
        return {"status": "ok", "service": "Lytrobot RAG Pipeline"}

    return fastapi_app


api = create_fastapi_application()
