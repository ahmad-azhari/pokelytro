from repository.mongodb_connection import MongoDBConnection
from models.type_models import TypeMatchup
from typing import List
import re


class TypeRepository:

    @staticmethod
    async def find_type_matchups(
        attacking_type: Optional[str] = None,
        defender_type: Optional[str] = None
    ) -> List[TypeMatchup]:
        database = MongoDBConnection.get_database()
        collection = database["types"]

        query = {}

        if attacking_type:
            attacking_regex = re.compile(f"^{re.escape(attacking_type)}$", re.IGNORECASE)
            query["attacking_type"] = {"$regex": attacking_regex}

        if defender_type:
            defender_regex = re.compile(f"^{re.escape(defender_type)}$", re.IGNORECASE)
            query["defender_type"] = {"$regex": defender_regex}

        cursor = collection.find(query)

        results = []
        async for document in cursor:
            results.append(TypeMatchup(**document))
        return results

    @staticmethod
    async def find_matchups_by_attacking_type(attacking_type: str) -> List[TypeMatchup]:
        database = MongoDBConnection.get_database()
        collection = database["types"]

        attacking_regex = re.compile(f"^{re.escape(attacking_type)}$", re.IGNORECASE)
        cursor = collection.find({"attacking_type": {"$regex": attacking_regex}})

        results = []
        async for document in cursor:
            results.append(TypeMatchup(**document))
        return results

    @staticmethod
    async def find_matchups_by_defending_type(defender_type: str) -> List[TypeMatchup]:
        database = MongoDBConnection.get_database()
        collection = database["types"]

        defender_regex = re.compile(f"^{re.escape(defender_type)}$", re.IGNORECASE)
        cursor = collection.find({"defender_type": {"$regex": defender_regex}})

        results = []
        async for document in cursor:
            results.append(TypeMatchup(**document))
        return results
