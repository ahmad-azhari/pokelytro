from repository.pokemon_repository import PokemonRepository
from repository.type_repository import TypeRepository
from repository.vector_search_repository import VectorSearchRepository
from services.embedding_service import EmbeddingService
from services.groq_llm_service import GroqLLMService
from services.reranking_service import RerankerService
from models.pokemon_models import PokemonDetail
from models.type_models import TypeMatchup
from typing import List, Tuple
import asyncio


class RetrievalOrchestrator:

    @staticmethod
    async def execute_full_rag_pipeline_for_user_query(
        user_query: str
    ) -> Tuple[List[PokemonDetail], List[TypeMatchup]]:
        expanded_query_variations = await GroqLLMService.generate_query_expansions_from_user_message(
            user_query
        )

        all_query_strings = [user_query] + expanded_query_variations
        all_embedding_vectors = [
            EmbeddingService.encode_text_to_embedding_vector(query_string)
            for query_string in all_query_strings
        ]

        unranked_pokemon_candidates = await VectorSearchRepository.search_pokemon_by_multiple_embeddings(
            all_embedding_vectors,
            number_of_results_per_query=settings.vector_search_initial_candidates
        )

        top_ranked_pokemon = await RerankerService.rerank_pokemon_candidates_by_query_relevance(
            user_query,
            unranked_pokemon_candidates,
            top_k_results=settings.vector_search_reranked_topk
        )

        relevant_types = []
        for pokemon in top_ranked_pokemon:
            type_matchups = await TypeRepository.find_type_matchups(
                attacking_type=pokemon.type1
            )
            relevant_types.extend(type_matchups)

        if top_ranked_pokemon and top_ranked_pokemon[0].type2:
            type_matchups_from_secondary = await TypeRepository.find_type_matchups(
                attacking_type=top_ranked_pokemon[0].type2
            )
            relevant_types.extend(type_matchups_from_secondary)

        unique_types = list({(t.attacking_type, t.defender_type): t for t in relevant_types}.values())

        return top_ranked_pokemon, unique_types

    @staticmethod
    async def retrieve_pokemon_context_string_for_llm_injection(
        top_pokemon_results: List[PokemonDetail]
    ) -> str:
        if not top_pokemon_results:
            return ""

        context_lines = ["**Database Results — Top Pokémon Found:**"]

        for index, pokemon in enumerate(top_pokemon_results, start=1):
            type_display = pokemon.type1
            if pokemon.type2:
                type_display += f"/{pokemon.type2}"

            abilities_display = pokemon.ability1
            if pokemon.ability2:
                abilities_display += f", {pokemon.ability2}"
            if pokemon.hidden_ability:
                abilities_display += f" (HA: {pokemon.hidden_ability})"

            pokemon_line = (
                f"{index}. **{pokemon.name}** (#{pokemon.id}) | "
                f"Type: {type_display} | "
                f"Stats: HP{pokemon.hp}/Atk{pokemon.attack}/Def{pokemon.defense}/"
                f"SpA{pokemon.special_attack}/SpD{pokemon.special_defense}/Spe{pokemon.speed} "
                f"(Total: {pokemon.total}) | "
                f"Abilities: {abilities_display}"
            )
            context_lines.append(pokemon_line)

        return "\n".join(context_lines)

    @staticmethod
    async def retrieve_type_context_string_for_llm_injection(
        type_matchups: List[TypeMatchup]
    ) -> str:
        if not type_matchups:
            return ""

        context_lines = ["**Type Matchup Data:**"]

        grouped_by_attacking = {}
        for matchup in type_matchups:
            if matchup.attacking_type not in grouped_by_attacking:
                grouped_by_attacking[matchup.attacking_type] = []
            grouped_by_attacking[matchup.attacking_type].append(matchup)

        for attacking_type in sorted(grouped_by_attacking.keys()):
            matchups = grouped_by_attacking[attacking_type]
            matchup_strs = [f"{m.defender_type} (×{m.multiplier})" for m in matchups]
            line = f"- **{attacking_type}** → {', '.join(matchup_strs)}"
            context_lines.append(line)

        return "\n".join(context_lines)


from config.settings import settings
