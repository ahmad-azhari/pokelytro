from repository.mongodb_connection import MongoDBConnection
from models.pokemon_models import PokemonDetail, PokemonSummary
from typing import List, Optional
import re


class PokemonRepository:

    @staticmethod
    async def find_pokemon_by_name_pattern(name_query: str) -> List[PokemonDetail]:
        database = MongoDBConnection.get_database()
        collection = database["pokemons"]

        name_regex = re.compile(name_query, re.IGNORECASE)
        cursor = collection.find({"name": {"$regex": name_regex}}).limit(5)

        results = []
        async for document in cursor:
            results.append(PokemonDetail(**document))
        return results

    @staticmethod
    async def find_pokemon_by_type(type_name: str) -> List[PokemonDetail]:
        database = MongoDBConnection.get_database()
        collection = database["pokemons"]

        type_regex = re.compile(f"^{re.escape(type_name)}$", re.IGNORECASE)
        cursor = collection.find({
            "$or": [
                {"type1": {"$regex": type_regex}},
                {"type2": {"$regex": type_regex}}
            ]
        }).limit(10)

        results = []
        async for document in cursor:
            results.append(PokemonDetail(**document))
        return results

    @staticmethod
    async def find_pokemon_by_id(pokemon_id: int) -> Optional[PokemonDetail]:
        database = MongoDBConnection.get_database()
        collection = database["pokemons"]

        document = await collection.find_one({"_id": pokemon_id})
        if document:
            return PokemonDetail(**document)
        return None

    @staticmethod
    async def get_all_pokemon_count() -> int:
        database = MongoDBConnection.get_database()
        collection = database["pokemons"]

        return await collection.count_documents({})

    @staticmethod
    async def get_all_pokemon() -> List[PokemonDetail]:
        database = MongoDBConnection.get_database()
        collection = database["pokemons"]

        cursor = collection.find({}).sort("_id", 1)

        results = []
        async for document in cursor:
            results.append(PokemonDetail(**document))
        return results

    @staticmethod
    async def create_pokemon_with_embedding(
        pokemon_data: dict,
        embedding_vector: List[float]
    ) -> PokemonDetail:
        database = MongoDBConnection.get_database()
        collection = database["pokemons"]

        pokemon_data["embedding_vector"] = embedding_vector

        await collection.update_one(
            {"_id": pokemon_data["_id"]},
            {"$set": pokemon_data},
            upsert=True
        )

        updated_document = await collection.find_one({"_id": pokemon_data["_id"]})
        return PokemonDetail(**updated_document)

    @staticmethod
    async def update_pokemon_with_embedding(
        pokemon_id: int,
        embedding_vector: List[float]
    ) -> Optional[PokemonDetail]:
        database = MongoDBConnection.get_database()
        collection = database["pokemons"]

        updated_document = await collection.find_one_and_update(
            {"_id": pokemon_id},
            {"$set": {"embedding_vector": embedding_vector}},
            return_document=True
        )

        if updated_document:
            return PokemonDetail(**updated_document)
        return None
