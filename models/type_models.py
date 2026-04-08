from pydantic import BaseModel
from typing import Optional


class TypeMatchup(BaseModel):
    attacking_type: str
    defender_type: str
    multiplier: float
