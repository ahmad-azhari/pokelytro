from pydantic import BaseModel, Field
from typing import Optional, List


class PokemonStatsBase(BaseModel):
    hp: int
    attack: int
    defense: int
    special_attack: int
    special_defense: int
    speed: int
    total: int


class PokemonTypeAndAbility(BaseModel):
    type1: str
    type2: Optional[str] = None
    ability1: str
    ability2: Optional[str] = None
    hidden_ability: Optional[str] = None


class PokemonPhysicalAttributes(BaseModel):
    height: float
    weight: float
    generation: int
    pokedex_color: str
    gender_ratio: str
    base_friendship: int
    experience_growth: str
    catch_rate: int
    experience_value: int
    egg_cycles: int
    egg_group1: str
    egg_group2: Optional[str] = None


class PokemonDexEntry(BaseModel):
    id: int = Field(..., alias="_id")
    name: str


class PokemonEmbeddings(BaseModel):
    embedding_vector: List[float]


class PokemonDetail(PokemonDexEntry, PokemonStatsBase, PokemonTypeAndAbility, PokemonPhysicalAttributes):
    evolution_method: Optional[str] = None
    embedding_vector: Optional[List[float]] = None

    class Config:
        populate_by_name = True


class PokemonSummary(PokemonDexEntry, PokemonStatsBase, PokemonTypeAndAbility):
    evolution_method: Optional[str] = None

    class Config:
        populate_by_name = True


class PokemonContextDisplay(BaseModel):
    pokemon_id: int
    name: str
    types_display: str
    stats_summary: str
    abilities_summary: str
    physical_attributes_summary: str
