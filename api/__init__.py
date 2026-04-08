from fastapi import APIRouter, HTTPException
from models.chat_models import ChatRequest, ChatResponse
from repository.pokemon_repository import PokemonRepository
from services.groq_llm_service import GroqLLMService
from services.retrieval_orchestrator import RetrievalOrchestrator
from utils.text_formatter import TextFormatterService
from config.settings import settings


chatbot_router = APIRouter()


@chatbot_router.post("/message", response_model=ChatResponse)
async def process_chatbot_message(request: ChatRequest) -> ChatResponse:
    if not request.message or not isinstance(request.message, str):
        raise HTTPException(status_code=400, detail="A valid message string is required.")

    try:
        top_ranked_pokemon, relevant_type_matchups = (
            await RetrievalOrchestrator.execute_full_rag_pipeline_for_user_query(
                request.message
            )
        )

        pokemon_context_for_injection = (
            TextFormatterService.format_pokemon_list_for_context_injection(top_ranked_pokemon)
        )

        type_context_for_injection = (
            TextFormatterService.format_type_matchup_chart_for_context_injection(
                relevant_type_matchups
            )
        )

        formatted_user_content_with_context = (
            TextFormatterService.format_combined_rag_context_for_groq_injection(
                pokemon_context_for_injection,
                type_context_for_injection,
                request.message
            )
        )

        total_pokemon_count = await PokemonRepository.get_all_pokemon_count()

        system_prompt_with_dynamic_pokemon_count = (
            settings.lytrobot_system_prompt_template.format(
                total_pokemons=total_pokemon_count
            )
        )

        conversation_history = request.history if request.history else []

        llm_reply = await GroqLLMService.generate_inference_with_database_context(
            system_instruction_with_total_count=system_prompt_with_dynamic_pokemon_count,
            database_context=formatted_user_content_with_context,
            user_query=request.message,
            conversation_history=conversation_history
        )

        return ChatResponse(reply=llm_reply)

    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Error processing message: {str(error)}")
