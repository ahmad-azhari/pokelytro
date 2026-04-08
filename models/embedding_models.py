from pydantic import BaseModel
from typing import List
from models.pokemon_models import PokemonSummary


class SearchCandidate(BaseModel):
    pokemon: PokemonSummary
    similarity_score: float
    source: str


class RerankedCandidate(BaseModel):
    pokemon: PokemonSummary
    relevance_score: float
    rank_position: int


class EmbeddingResult(BaseModel):
    pokemon_id: int
    embedding_vector: List[float]
