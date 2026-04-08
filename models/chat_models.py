from pydantic import BaseModel
from typing import List, Optional


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None


class ChatResponse(BaseModel):
    reply: str


class ExpandedQuery(BaseModel):
    original_query: str
    expanded_variations: List[str]


class ExpandedQueryResult(BaseModel):
    original_query: str
    variation_1: str
    variation_2: str
    variation_3: str
