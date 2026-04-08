from models.pokemon_models import PokemonDetail
from models.type_models import TypeMatchup
from typing import List


class TextFormatterService:

    @staticmethod
    def format_pokemon_list_for_context_injection(pokemon_list: List[PokemonDetail]) -> str:
        if not pokemon_list:
            return ""

        formatted_lines = []

        for pokemon in pokemon_list:
            type_string = pokemon.type1
            if pokemon.type2:
                type_string += f"/{pokemon.type2}"

            abilities_string = pokemon.ability1
            if pokemon.ability2:
                abilities_string += f", {pokemon.ability2}"
            if pokemon.hidden_ability:
                abilities_string += f" (HA: {pokemon.hidden_ability})"

            formatted_pokemon = (
                f"[#{pokemon.id} {pokemon.name}] "
                f"Type: {type_string} | "
                f"HP:{pokemon.hp} Atk:{pokemon.attack} Def:{pokemon.defense} "
                f"SpA:{pokemon.special_attack} SpD:{pokemon.special_defense} Spe:{pokemon.speed} "
                f"(Total:{pokemon.total}) | "
                f"Abilities: {abilities_string} | "
                f"Height:{pokemon.height}m Weight:{pokemon.weight}kg | "
                f"Gen:{pokemon.generation}"
                + (f" | Evo: {pokemon.evolution_method}" if pokemon.evolution_method else "")
            )

            formatted_lines.append(formatted_pokemon)

        return "\n".join(formatted_lines)

    @staticmethod
    def format_type_matchup_chart_for_context_injection(
        type_matchups: List[TypeMatchup]
    ) -> str:
        if not type_matchups:
            return ""

        formatted_lines = []

        for matchup in sorted(type_matchups, key=lambda t: (t.attacking_type, t.defender_type)):
            formatted_matchup = (
                f"{matchup.attacking_type} → {matchup.defender_type}: "
                f"×{matchup.multiplier}"
            )
            formatted_lines.append(formatted_matchup)

        return "\n".join(formatted_lines)

    @staticmethod
    def format_combined_rag_context_for_groq_injection(
        pokemon_context: str,
        type_context: str,
        user_question: str
    ) -> str:
        context_sections = []

        if pokemon_context:
            context_sections.append(f"--- Retrieved from Pokelytro Database ---\n{pokemon_context}")

        if type_context:
            context_sections.append(f"--- Type Matchup Data ---\n{type_context}")

        if context_sections:
            combined_context = "\n\n".join(context_sections)
            return f"{combined_context}\n\n--- End Database Context ---\n\nUser Question: {user_question}"
        else:
            return f"User Question: {user_question}"
