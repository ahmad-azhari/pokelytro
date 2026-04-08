from fastapi import APIRouter, HTTPException
from models.pokemon_models import PokemonDetail, PokemonSummary
from repository.pokemon_repository import PokemonRepository
from typing import List


pokemon_router = APIRouter()


@pokemon_router.get("/", response_model=List[PokemonSummary])
async def retrieve_all_pokemon() -> List[PokemonSummary]:
    try:
        all_pokemon = await PokemonRepository.get_all_pokemon()
        return all_pokemon
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Error retrieving Pokémon: {str(error)}")


@pokemon_router.get("/{pokemon_id}", response_model=PokemonDetail)
async def retrieve_pokemon_by_id(pokemon_id: int) -> PokemonDetail:
    try:
        pokemon = await PokemonRepository.find_pokemon_by_id(pokemon_id)
        if not pokemon:
            raise HTTPException(status_code=404, detail=f"Pokémon with ID {pokemon_id} not found.")
        return pokemon
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Error retrieving Pokémon: {str(error)}")


@pokemon_router.get("/search/{search_query}", response_model=List[PokemonSummary])
async def search_pokemon_by_name_or_attribute(search_query: str) -> List[PokemonSummary]:
    try:
        results = await PokemonRepository.find_pokemon_by_name_pattern(search_query)
        return results
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Error searching Pokémon: {str(error)}")
