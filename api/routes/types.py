from fastapi import APIRouter, HTTPException
from models.type_models import TypeMatchup
from repository.type_repository import TypeRepository
from typing import List, Optional


type_router = APIRouter()


@type_router.get("/matchups", response_model=List[TypeMatchup])
async def retrieve_all_type_matchups() -> List[TypeMatchup]:
    try:
        matchups = await TypeRepository.find_type_matchups()
        return matchups
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Error retrieving type matchups: {str(error)}")


@type_router.get("/attacking/{attacking_type}", response_model=List[TypeMatchup])
async def retrieve_matchups_by_attacking_type(attacking_type: str) -> List[TypeMatchup]:
    try:
        matchups = await TypeRepository.find_matchups_by_attacking_type(attacking_type)
        if not matchups:
            raise HTTPException(
                status_code=404,
                detail=f"No matchups found for attacking type '{attacking_type}'."
            )
        return matchups
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Error retrieving matchups: {str(error)}")


@type_router.get("/defending/{defender_type}", response_model=List[TypeMatchup])
async def retrieve_matchups_by_defending_type(defender_type: str) -> List[TypeMatchup]:
    try:
        matchups = await TypeRepository.find_matchups_by_defending_type(defender_type)
        if not matchups:
            raise HTTPException(
                status_code=404,
                detail=f"No matchups found for defending type '{defender_type}'."
            )
        return matchups
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Error retrieving matchups: {str(error)}")
