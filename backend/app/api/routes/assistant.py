from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_traveler_id
from app.config import get_settings
from app.core.rate_limiting import limiter
from app.database.session import get_db
from app.schemas.assistant import AssistantRequest, AssistantResponse, DisruptionExtractRequest, DisruptionExtractResponse
from app.services import assistant_service, trip_service

router = APIRouter(prefix="/api", tags=["assistant"])


@router.post("/assistant", response_model=AssistantResponse)
@limiter.limit(lambda: get_settings().assistant_rate_limit)
def ask_assistant(
    payload: AssistantRequest, request: Request, db: Session = Depends(get_db), traveler_id: str = Depends(get_current_traveler_id)
):
    try:
        return assistant_service.answer_question(db, payload.trip_id, payload.message, traveler_id)
    except trip_service.TripNotFoundError:
        raise HTTPException(status_code=404, detail=f"Trip '{payload.trip_id}' not found")


@router.post("/assistant/extract-disruption", response_model=DisruptionExtractResponse)
@limiter.limit(lambda: get_settings().assistant_rate_limit)
def extract_disruption(
    payload: DisruptionExtractRequest, request: Request, traveler_id: str = Depends(get_current_traveler_id)
):
    return assistant_service.extract_disruption_report(payload.message, payload.nodes)
