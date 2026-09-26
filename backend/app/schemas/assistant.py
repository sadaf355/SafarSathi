from pydantic import Field, field_validator

from app.schemas.base import CamelModel


class AssistantReference(CamelModel):
    type: str
    id: str
    label: str


class AssistantRequest(CamelModel):
    trip_id: str = Field(..., min_length=1, max_length=100, description="Target trip ID")
    message: str = Field(..., min_length=1, max_length=2000, description="Question or prompt from traveler")

    @field_validator("message", "trip_id")
    @classmethod
    def strip_and_validate_non_empty(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty or only whitespace")
        return cleaned


class AssistantResponse(CamelModel):
    content: str
    references: list[AssistantReference] = []
    source: str  # "llm" | "deterministic"


class RecoveryNarrativeRequest(CamelModel):
    trip_id: str = Field(..., min_length=1, max_length=100)


class DisruptionExtractRequest(CamelModel):
    text: str = Field(..., min_length=1, max_length=4000, description="Raw airline SMS / email text")
    trip_id: str | None = Field(default=None, max_length=100)

    @field_validator("text")
    @classmethod
    def strip_text(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Text cannot be empty or only whitespace")
        return cleaned


class DisruptionExtractResponse(CamelModel):
    """Structured reading of a free-text disruption notice. `type` is a valid
    disruption type (ready for POST /api/trips/{id}/disruptions) or None when
    the message is informational only (e.g. a gate change)."""

    type: str | None = None
    delay_minutes: int | None = None
    flight_number: str | None = None
    gate: str | None = None
    primary_node_id: str | None = None
    primary_node_label: str | None = None
    confidence: float = 0.0
    matched_signals: list[str] = []
    summary: str
    source: str = "heuristic"  # "heuristic" | "llm"