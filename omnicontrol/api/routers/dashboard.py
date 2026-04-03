from fastapi import APIRouter

from ...backends import get_backend

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/")
def get_dashboard():
    backend = get_backend()
    active_timer = backend.clocks.get_active()
    open_tasks = backend.tasks.list_tasks(include_done=False)
    inbox_items = backend.inbox.list_items()
    budgets = backend.customers.get_budget_summary()

    return {
        "active_timer": active_timer,
        "open_task_count": len(open_tasks),
        "inbox_count": len(inbox_items),
        "budgets": budgets,
    }
