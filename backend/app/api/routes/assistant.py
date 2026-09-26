from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_traveler_id
from app.database.session import get_db
from app.schemas.assistant import AssistantRequest, AssistantResponse, DisruptionExtractRequest, DisruptionExtractResponse
from app.services import assistant_service, trip_service

router = APIRouter(prefix="/api", tags=["assistant"])


@router.post("/assistant", response_model=AssistantResponse)
def ask_assistant(
    request: AssistantRequest, db: Session = Depends(get_db), traveler_id: str = Depends(get_current_traveler_id)
):
    try:
        return assistant_service.answer_question(db, request.trip_id, request.message, traveler_id)
    except trip_service.TripNotFoundError:
        raise HTTPException(status_code=404, detail=f"Trip '{request.trip_id}' not found")


@router.post("/assistant/extract-disruption", response_model=DisruptionExtractResponse)
def extract_disruption(request: DisruptionExtractRequest, traveler_id: str = Depends(get_current_traveler_id)):
    return assistant_service.extract_disruption_report(request.message, request.nodes)
