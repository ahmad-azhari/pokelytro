from repository.mongodb_connection import MongoDBConnection
from models.pokemon_models import PokemonDetail
from typing import List


class VectorSearchRepository:

    @staticmethod
    async def search_pokemon_by_embedding(
        query_embedding_vector: List[float],
        number_of_results: int = 20
    ) -> List[PokemonDetail]:
        database = MongoDBConnection.get_database()
        collection = database["pokemons"]

        pipeline = [
            {
                "$search": {
                    "cosmosSearch": True,
                    "vector": query_embedding_vector,
                    "k": number_of_results
                },
                "path": "embedding_vector"
            },
            {
                "$project": {
                    "_id": 1,
                    "name": 1,
                    "type1": 1,
                    "type2": 1,
                    "ability1": 1,
                    "ability2": 1,
                    "hidden_ability": 1,
                    "hp": 1,
                    "attack": 1,
                    "defense": 1,
                    "special_attack": 1,
                    "special_defense": 1,
                    "speed": 1,
                    "total": 1,
                    "generation": 1,
                    "height": 1,
                    "weight": 1,
                    "evolution_method": 1,
                    "pokedex_color": 1,
                    "gender_ratio": 1,
                    "base_friendship": 1,
                    "experience_growth": 1,
                    "catch_rate": 1,
                    "experience_value": 1,
                    "egg_cycles": 1,
                    "egg_group1": 1,
                    "egg_group2": 1,
                    "similarity_score": {
                        "$meta": "searchScore"
                    }
                }
            }
        ]

        cursor = collection.aggregate(pipeline)

        results = []
        async for document in cursor:
            results.append(PokemonDetail(**document))
        return results

    @staticmethod
    async def search_pokemon_by_multiple_embeddings(
        query_embedding_vectors: List[List[float]],
        number_of_results_per_query: int = 20
    ) -> List[PokemonDetail]:
        all_results = []
        seen_ids = set()

        for embedding_vector in query_embedding_vectors:
            results = await VectorSearchRepository.search_pokemon_by_embedding(
                embedding_vector,
                number_of_results_per_query
            )

            for pokemon in results:
                if pokemon.id not in seen_ids:
                    all_results.append(pokemon)
                    seen_ids.add(pokemon.id)

        return all_results
