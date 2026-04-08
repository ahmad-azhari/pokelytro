from models.pokemon_models import PokemonDetail
from services.groq_llm_service import GroqLLMService
from typing import List


class RerankerService:

    @staticmethod
    async def rerank_pokemon_candidates_by_query_relevance(
        user_query: str,
        unranked_pokemon_candidates: List[PokemonDetail],
        top_k_results: int = 5
    ) -> List[PokemonDetail]:
        if len(unranked_pokemon_candidates) == 0:
            return []

        if len(unranked_pokemon_candidates) <= top_k_results:
            return unranked_pokemon_candidates

        pokemon_descriptions_for_scoring = []
        for pokemon in unranked_pokemon_candidates:
            description = (
                f"{pokemon.name} (#{pokemon.id}): "
                f"Type {pokemon.type1}"
                + (f"/{pokemon.type2}" if pokemon.type2 else "")
                + f" | Stats: HP{pokemon.hp}/Atk{pokemon.attack}/Def{pokemon.defense}"
                f"/SpA{pokemon.special_attack}/SpD{pokemon.special_defense}/Spe{pokemon.speed} "
                f"| Abilities: {pokemon.ability1}"
                + (f", {pokemon.ability2}" if pokemon.ability2 else "")
                + (f", HA: {pokemon.hidden_ability}" if pokemon.hidden_ability else "")
            )
            pokemon_descriptions_for_scoring.append(description)

        relevance_scores = await GroqLLMService.score_candidates_for_relevance(
            user_query,
            pokemon_descriptions_for_scoring
        )

        pokemon_with_scores = [
            (pokemon, score)
            for pokemon, score in zip(unranked_pokemon_candidates, relevance_scores)
        ]

        pokemon_with_scores.sort(key=lambda x: x[1], reverse=True)

        top_k_pokemon = [pokemon for pokemon, _ in pokemon_with_scores[:top_k_results]]

        return top_k_pokemon
