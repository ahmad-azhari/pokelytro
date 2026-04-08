from groq import AsyncGroq
from config.settings import settings
from typing import List
from models.chat_models import ChatMessage
import asyncio


class GroqLLMService:
    _client: AsyncGroq = None

    @classmethod
    def get_client(cls) -> AsyncGroq:
        if cls._client is None:
            cls._client = AsyncGroq(api_key=settings.groq_api_key)
        return cls._client

    @staticmethod
    async def generate_query_expansions_from_user_message(
        user_message: str
    ) -> List[str]:
        client = GroqLLMService.get_client()

        expansion_prompt = f"""Given this Pokémon-related query, generate exactly 3 alternative search variations that maintain the semantic intent but use different phrasing or perspectives.

Original query: "{user_message}"

Return ONLY the 3 variations, one per line, without numbering or extra text."""

        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "user", "content": expansion_prompt}
            ],
            temperature=0.3,
            max_tokens=200
        )

        expanded_text = response.choices[0].message.content
        variations = [line.strip() for line in expanded_text.strip().split("\n") if line.strip()]

        if len(variations) > 3:
            variations = variations[:3]
        elif len(variations) < 3:
            variations.extend([user_message] * (3 - len(variations)))

        return variations

    @staticmethod
    async def generate_inference_with_database_context(
        system_instruction_with_total_count: str,
        database_context: str,
        user_query: str,
        conversation_history: List[ChatMessage]
    ) -> str:
        client = GroqLLMService.get_client()

        messages = [
            {
                "role": "system",
                "content": system_instruction_with_total_count
            }
        ]

        if conversation_history:
            for history_message in conversation_history:
                messages.append({
                    "role": history_message.role,
                    "content": history_message.content
                })

        formatted_user_content = f"""{database_context}

User Question: {user_query}"""

        messages.append({
            "role": "user",
            "content": formatted_user_content
        })

        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=messages,
            temperature=settings.groq_temperature,
            max_tokens=settings.groq_max_tokens
        )

        return response.choices[0].message.content or "I couldn't process that request."

    @staticmethod
    async def score_candidates_for_relevance(
        user_query: str,
        candidate_pokemon_descriptions: List[str]
    ) -> List[float]:
        client = GroqLLMService.get_client()

        scoring_prompt = f"""Rate each Pokémon description's relevance to the user's query on a scale of 0.0 to 1.0.

User Query: "{user_query}"

Pokémon Descriptions:
{chr(10).join([f"{i+1}. {desc}" for i, desc in enumerate(candidate_pokemon_descriptions)])}

Return ONLY the scores, one per line, as decimal numbers (e.g., 0.95)."""

        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "user", "content": scoring_prompt}
            ],
            temperature=0.2,
            max_tokens=100
        )

        scores_text = response.choices[0].message.content
        scores_raw = [line.strip() for line in scores_text.strip().split("\n") if line.strip()]

        scores = []
        for score_str in scores_raw:
            try:
                score_float = float(score_str)
                scores.append(max(0.0, min(1.0, score_float)))
            except ValueError:
                scores.append(0.5)

        while len(scores) < len(candidate_pokemon_descriptions):
            scores.append(0.5)

        return scores[:len(candidate_pokemon_descriptions)]
