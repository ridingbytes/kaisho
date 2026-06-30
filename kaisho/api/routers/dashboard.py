from fastapi import APIRouter

from ...backends import get_backend
from ...services import dashboard as dashboard_svc

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/")
def get_dashboard():
    """Return dashboard summary with key metrics."""
    return dashboard_svc.build_summary(get_backend())


@router.get("/time-insights")
def get_time_insights(period: str = "month"):
    """Return time tracking insights for the dashboard."""
    return dashboard_svc.build_time_insights(
        get_backend(), period,
    )
