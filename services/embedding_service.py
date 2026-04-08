from sentence_transformers import SentenceTransformer
from config.settings import settings
from typing import List
import numpy as np


class EmbeddingService:
    _model_instance: SentenceTransformer = None

    @classmethod
    def initialize_embedding_model(cls) -> None:
        if cls._model_instance is None:
            cls._model_instance = SentenceTransformer(settings.embedding_model_name)

    @classmethod
    def get_embedding_model(cls) -> SentenceTransformer:
        if cls._model_instance is None:
            cls.initialize_embedding_model()
        return cls._model_instance

    @staticmethod
    def encode_text_to_embedding_vector(text_input: str) -> List[float]:
        model = EmbeddingService.get_embedding_model()
        embedding_array = model.encode(text_input, normalize_embeddings=True)
        return embedding_array.tolist()

    @staticmethod
    def encode_multiple_texts_to_embedding_vectors(text_list: List[str]) -> List[List[float]]:
        model = EmbeddingService.get_embedding_model()
        embeddings_array = model.encode(text_list, normalize_embeddings=True)
        return [embedding.tolist() for embedding in embeddings_array]

    @staticmethod
    def compute_cosine_similarity_between_vectors(
        vector_a: List[float],
        vector_b: List[float]
    ) -> float:
        array_a = np.array(vector_a)
        array_b = np.array(vector_b)

        dot_product = np.dot(array_a, array_b)
        norm_a = np.linalg.norm(array_a)
        norm_b = np.linalg.norm(array_b)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        similarity = dot_product / (norm_a * norm_b)
        return float(similarity)

    @staticmethod
    def construct_pokemon_embedding_text_from_attributes(
        pokemon_name: str,
        primary_type: str,
        secondary_type: str,
        ability_primary: str,
        ability_secondary: str,
        hidden_ability: str,
        hp_stat: int,
        attack_stat: int,
        defense_stat: int,
        special_attack_stat: int,
        special_defense_stat: int,
        speed_stat: int,
        total_base_stats: int,
        generation_number: int,
        height_in_meters: float,
        weight_in_kg: float,
        evolution_mechanism: str
    ) -> str:
        type_info = f"Type: {primary_type}"
        if secondary_type:
            type_info += f" and {secondary_type}"

        ability_info = f"Abilities: {ability_primary}"
        if ability_secondary:
            ability_info += f", {ability_secondary}"
        if hidden_ability:
            ability_info += f" (Hidden: {hidden_ability})"

        stats_info = (
            f"Stats: HP={hp_stat}, Atk={attack_stat}, Def={defense_stat}, "
            f"SpA={special_attack_stat}, SpD={special_defense_stat}, Spe={speed_stat}, Total={total_base_stats}"
        )

        physical_info = f"Height: {height_in_meters}m, Weight: {weight_in_kg}kg, Generation: {generation_number}"

        evolution_info = f"Evolution: {evolution_mechanism}" if evolution_mechanism else "No evolution method specified"

        embedding_text = f"{pokemon_name}. {type_info}. {ability_info}. {stats_info}. {physical_info}. {evolution_info}"

        return embedding_text
