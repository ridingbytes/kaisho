from fastapi import APIRouter

from ...config import get_config, load_settings_yaml
from ...services import clocks as clock_svc
from ...services import customers as customer_svc
from ...services import inbox as inbox_svc
from ...services import kanban as kanban_svc
from ...services.settings import get_state_names

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _get_keywords() -> set[str]:
    settings = load_settings_yaml()
    names = get_state_names(settings)
    return set(names) if names else {
        "TODO", "NEXT", "IN-PROGRESS", "WAIT", "DONE", "CANCELLED"
    }


@router.get("/")
def get_dashboard():
    cfg = get_config()
    keywords = _get_keywords()

    active_timer = clock_svc.get_active_timer(
        clocks_file=cfg.CLOCKS_FILE
    )
    open_tasks = kanban_svc.list_tasks(
        todos_file=cfg.TODOS_FILE,
        keywords=keywords,
        include_done=False,
    )
    inbox_items = inbox_svc.list_items(inbox_file=cfg.INBOX_FILE)
    budgets = customer_svc.get_budget_summary(
        kunden_file=cfg.KUNDEN_FILE
    )

    return {
        "active_timer": active_timer,
        "open_task_count": len(open_tasks),
        "inbox_count": len(inbox_items),
        "budgets": budgets,
    }
