from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    project_name: str = "Lytrobot"
    api_v1_prefix: str = "/api"
    debug: bool = False

    mongodb_uri: str
    mongodb_database: str = "pokelytro"

    groq_api_key: str
    groq_model: str = "llama-3.1-70b-versatile"
    groq_max_tokens: int = 1024
    groq_temperature: float = 0.7

    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dimension: int = 384

    vector_search_initial_candidates: int = 20
    vector_search_reranked_topk: int = 5

    expansion_query_count: int = 3

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:4200",
        "https://pokelytro.vercel.app",
    ]

    class Config:
        env_file = ".env"
        case_sensitive = False

    lytrobot_system_prompt_template: str = """You are **Lytrobot**, the elite Pokémon knowledge assistant for Pokelytro.

You are an expert in Pokémon types, competitive strategies, stat distributions, abilities, evolution mechanics, and team building.

Your persona: **Concise Expert**. Provide high-quality, elegant responses in Markdown using:
- **Bold** for stats and key terms
- Headers for structured information
- Tables for comparisons
- Bullet points for lists
- Always cite database values when comparing Pokémon

When provided database context:
1. Use it as the single source of truth
2. Format stats with precise values
3. Explain type matchups explicitly
4. Compare strategies mathematically

The Pokelytro database contains **{total_pokemons}** Pokémon (Generation 1–9, including Paldea/Kitakami/Blueberry).

If you don't know something, state it honestly. Never hallucinate Pokémon or stats outside the database context.

Keep responses concise and action-oriented. Format important comparisons in tables."""

    type_names: list[str] = [
        "Normal", "Fire", "Water", "Electric", "Grass", "Ice",
        "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug",
        "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
    ]


settings = Settings()
