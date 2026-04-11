"""Markdown backend using real .md files as storage.

Each domain gets its own Markdown file inside a configurable
directory (default: data/markdown/). Data is stored as proper
markdown with level-2 headings and HTML comment property blocks.

Set BACKEND=markdown in .env to activate.
"""
import hashlib
import re
import tempfile
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

from ...time_utils import local_now_naive as _local_now

from ..base import (
    ClockBackend,
    CustomerBackend,
    InboxBackend,
    NotesBackend,
    TaskBackend,
)


# -- HTML comment property helpers ----------------------------------

PROP_BLOCK_RE = re.compile(
    r"<!--\s*\n(.*?)\n\s*-->",
    re.DOTALL,
)


def _parse_props(block: str) -> dict:
    """Parse key: value lines from HTML comment block.

    >>> _parse_props("id: abc123\\ncreated: 2026-04-07")
    {'id': 'abc123', 'created': '2026-04-07'}
    >>> _parse_props("")
    {}
    """
    props = {}
    for line in block.strip().splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        k, v = line.split(":", 1)
        props[k.strip()] = v.strip()
    return props


def _render_props(props: dict) -> str:
    """Render dict as HTML comment property block.

    >>> _render_props({"id": "abc", "status": "active"})
    '<!--\\nid: abc\\nstatus: active\\n-->'
    >>> _render_props({})
    ''
    """
    items = [
        (k, v) for k, v in props.items()
        if v not in (None, "", 0, 0.0)
    ]
    if not items:
        return ""
    lines = [f"{k}: {v}" for k, v in items]
    return "<!--\n" + "\n".join(lines) + "\n-->"


# -- Markdown parsing helpers --------------------------------------


def _parse_md_sections(
    text: str, level: int = 2
) -> list[dict]:
    """Split markdown into sections by heading level.

    Returns list of dicts with keys:
      heading  -- text after the ## marker
      meta     -- parsed dict from HTML comment block
      body     -- everything after the comment block
      raw      -- original full section text
    """
    prefix = "#" * level + " "
    pattern = re.compile(
        r"^" + re.escape(prefix), re.MULTILINE
    )
    splits = list(pattern.finditer(text))
    if not splits:
        return []

    sections = []
    for i, match in enumerate(splits):
        start = match.start()
        end = (
            splits[i + 1].start()
            if i + 1 < len(splits)
            else len(text)
        )
        raw = text[start:end]
        first_newline = raw.find("\n")
        heading = (
            raw[len(prefix):first_newline].strip()
            if first_newline != -1
            else raw[len(prefix):].strip()
        )
        after_heading = (
            raw[first_newline + 1:]
            if first_newline != -1
            else ""
        )
        meta = {}
        body = after_heading
        prop_match = PROP_BLOCK_RE.search(after_heading)
        if prop_match:
            meta = _parse_props(prop_match.group(1))
            body = after_heading[
                prop_match.end():
            ].strip("\n")
        body = _unescape_body(body)
        sections.append({
            "heading": heading,
            "meta": meta,
            "body": body,
            "raw": raw,
        })
    # Merge sections without metadata into the
    # previous section's body. A ## line without a
    # <!-- --> block is body content, not a new entry.
    merged = []
    for sec in sections:
        if not sec["meta"] and merged:
            merged[-1]["body"] += (
                "\n" + prefix + sec["heading"]
                + "\n" + sec["body"]
            )
            merged[-1]["raw"] += sec["raw"]
        else:
            merged.append(sec)
    return merged


def _escape_body(body: str, level: int) -> str:
    """Escape heading markers in body text.

    Prefixes lines starting with the section heading
    marker (e.g. ``## ``) with a backslash so they
    are not mistaken for new sections on re-read.
    """
    prefix = "#" * level + " "
    lines = []
    for line in body.split("\n"):
        if line.startswith(prefix):
            lines.append("\\" + line)
        else:
            lines.append(line)
    return "\n".join(lines)


def _unescape_body(body: str) -> str:
    r"""Remove backslash escapes from heading markers.

    Reverses ``_escape_body``: ``\## `` becomes ``## ``.
    """
    lines = []
    for line in body.split("\n"):
        if line.startswith("\\#"):
            lines.append(line[1:])
        else:
            lines.append(line)
    return "\n".join(lines)


def _render_md_sections(
    sections: list[dict], level: int = 2
) -> str:
    """Render sections back to markdown text."""
    prefix = "#" * level
    parts = []
    for sec in sections:
        lines = [f"{prefix} {sec['heading']}"]
        prop_block = _render_props(sec.get("meta", {}))
        if prop_block:
            lines.append(prop_block)
        if sec.get("body"):
            lines.append("")
            lines.append(
                _escape_body(sec["body"], level),
            )
        parts.append("\n".join(lines))
    return "\n\n".join(parts) + "\n" if parts else ""


# -- File I/O helpers -----------------------------------------------


def _read_md(path: Path) -> str:
    """Read text from *path*, returning '' if missing."""
    if not path.exists():
        return ""
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def _write_md(path: Path, text: str) -> None:
    """Atomically write *text* to *path*."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(
        dir=path.parent, suffix=".tmp"
    )
    try:
        with open(tmp_fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        Path(tmp_path).replace(path)
    except BaseException:
        Path(tmp_path).unlink(missing_ok=True)
        raise


def _generate_id(seed: str) -> str:
    """Return a 12-char hex ID derived from *seed* + now."""
    raw = f"{seed}{datetime.now().isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


# -- Duration parsing -----------------------------------------------

_DURATION_RE = re.compile(
    r"(?:(\d+)\s*h)?[\s,]*(?:(\d+)\s*m(?:in)?)?",
    re.IGNORECASE,
)


def _parse_duration_minutes(duration_str: str) -> int:
    """Parse '2h', '30min', '1h30m' into total minutes."""
    m = _DURATION_RE.match(duration_str.strip())
    if not m or (not m.group(1) and not m.group(2)):
        raise ValueError(
            f"Cannot parse duration: {duration_str!r}"
        )
    hours = int(m.group(1)) if m.group(1) else 0
    mins = int(m.group(2)) if m.group(2) else 0
    return hours * 60 + mins


# -- Period filtering -----------------------------------------------


def _period_range(period: str) -> tuple[date, date]:
    """Return (start_date, end_date) for a named period."""
    today = date.today()
    if period == "today":
        return today, today
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start, today
    if period == "month":
        start = today.replace(day=1)
        return start, today
    if period == "year":
        start = today.replace(month=1, day=1)
        return start, today
    # "all" or any unknown period -- return widest range
    return date.min, date.max


def _entry_in_range(
    entry: dict, start: date, end: date
) -> bool:
    """Check if a clock entry falls within [start, end]."""
    entry_start = entry.get("start", "")
    if not entry_start:
        return False
    entry_date = datetime.fromisoformat(entry_start).date()
    return start <= entry_date <= end


# -- Auto-categorize for inbox --------------------------------------


def _guess_inbox_type(text: str) -> str:
    """Simple heuristic to categorise inbox items."""
    lower = text.lower()
    if any(
        w in lower
        for w in ("bug", "fix", "error", "broken")
    ):
        return "bug"
    if any(
        w in lower
        for w in ("idea", "feature", "request")
    ):
        return "feature"
    if any(
        w in lower
        for w in ("call", "meet", "email", "mail")
    ):
        return "communication"
    return "note"


# -- Tag helpers (org-style :tag1:tag2: suffix) ---------------------

_TAG_SUFFIX_RE = re.compile(
    r"\s+(:[a-zA-Z0-9_@-]+(?::[a-zA-Z0-9_@-]+)*:)\s*$"
)


def _strip_tags(heading: str) -> tuple[str, list[str]]:
    """Split heading into (text, tags) removing tag suffix."""
    m = _TAG_SUFFIX_RE.search(heading)
    if not m:
        return heading.strip(), []
    tag_str = m.group(1)
    text = heading[:m.start()].strip()
    tags = [t for t in tag_str.split(":") if t]
    return text, tags


def _append_tags(heading: str, tags: list[str]) -> str:
    """Append org-style tag suffix to a heading."""
    if not tags:
        return heading
    tag_str = ":" + ":".join(tags) + ":"
    return f"{heading}    {tag_str}"


# -- Task heading helpers -------------------------------------------


def _task_heading(task: dict) -> str:
    """Build heading: STATUS [CUSTOMER] Title    :tags:."""
    customer = task.get("customer") or ""
    status = task.get("status", "TODO")
    title = task.get("title", "")
    if customer:
        base = f"{status} [{customer}] {title}"
    else:
        base = f"{status} {title}"
    return _append_tags(base, task.get("tags", []))


_TASK_STATUSES = {
    "TODO", "NEXT", "IN-PROGRESS", "WAIT",
    "DONE", "CANCELLED",
}


def _parse_task_heading(heading: str) -> dict:
    """Extract status, customer, title, tags from heading."""
    text, tags = _strip_tags(heading)
    # With customer: STATUS [CUSTOMER] Title
    m = re.match(
        r"(\S+)\s+\[([^\]]*)\]\s+(.*)", text,
    )
    if m:
        return {
            "status": m.group(1),
            "customer": m.group(2),
            "title": m.group(3),
            "tags": tags,
        }
    # Without customer: STATUS Title
    parts = text.split(None, 1)
    if len(parts) == 2 and parts[0] in _TASK_STATUSES:
        return {
            "status": parts[0],
            "customer": "",
            "title": parts[1],
            "tags": tags,
        }
    return {
        "status": "TODO",
        "customer": "",
        "title": text,
        "tags": tags,
    }


def _props_to_task_meta(meta: dict) -> dict:
    """Extract task fields and properties from flat props.

    Lines prefixed with ``prop_`` become entries in the
    ``properties`` sub-dict.
    """
    properties = {}
    plain = {}
    for k, v in meta.items():
        if k.startswith("prop_"):
            properties[k[5:]] = v
        else:
            plain[k] = v
    plain["properties"] = properties
    return plain


def _task_meta_to_props(meta: dict) -> dict:
    """Flatten task meta + properties into prop lines."""
    out = {}
    for k, v in meta.items():
        if k == "properties":
            continue
        out[k] = v
    for k, v in meta.get("properties", {}).items():
        out[f"prop_{k}"] = v
    return out


def _section_to_task(sec: dict) -> dict:
    """Convert a parsed section to a task dict.

    Auto-generates an ID if missing (manually added).
    """
    parsed = _parse_task_heading(sec["heading"])
    meta = _props_to_task_meta(sec.get("meta", {}))
    tid = meta.get("id", "")
    if not tid:
        tid = _generate_id(parsed["title"])
        meta["id"] = tid
        sec["meta"] = _task_meta_to_props(meta)
    return {
        "id": tid,
        "customer": parsed["customer"],
        "title": parsed["title"],
        "status": parsed["status"],
        "tags": parsed.get("tags", []),
        "body": sec.get("body", ""),
        "github_url": meta.get("github_url", ""),
        "properties": meta.get("properties", {}),
        "created": meta.get("created", ""),
        "archived_at": meta.get("archived_at", ""),
        "archive_status": meta.get(
            "archive_status", ""
        ),
    }


def _task_to_section(task: dict) -> dict:
    """Convert a task dict to a section dict."""
    meta = {
        "id": task.get("id", ""),
        "created": task.get("created", ""),
        "github_url": task.get("github_url", ""),
    }
    if task.get("archived_at"):
        meta["archived_at"] = task["archived_at"]
    if task.get("archive_status"):
        meta["archive_status"] = task["archive_status"]
    props = _task_meta_to_props({
        **meta,
        "properties": task.get("properties", {}),
    })
    return {
        "heading": _task_heading(task),
        "meta": props,
        "body": task.get("body", ""),
    }


# ====================================================================
#  TaskBackend
# ====================================================================


class MarkdownTaskBackend(TaskBackend):
    def __init__(
        self, tasks_file: Path, archive_file: Path
    ):
        self._tasks_file = tasks_file
        self._archive_file = archive_file

    @property
    def data_file(self) -> Path:
        return self._tasks_file

    def _load_tasks(self) -> list[dict]:
        text = _read_md(self._tasks_file)
        sections = _parse_md_sections(text)
        had_missing = any(
            not s.get("meta", {}).get("id")
            for s in sections
        )
        tasks = [_section_to_task(s) for s in sections]
        if had_missing and tasks:
            self._save_tasks(tasks)
        return tasks

    def _save_tasks(self, tasks: list[dict]) -> None:
        sections = [_task_to_section(t) for t in tasks]
        _write_md(
            self._tasks_file,
            _render_md_sections(sections),
        )

    def _load_archive(self) -> list[dict]:
        text = _read_md(self._archive_file)
        sections = _parse_md_sections(text)
        return [_section_to_task(s) for s in sections]

    def _save_archive(self, tasks: list[dict]) -> None:
        sections = [_task_to_section(t) for t in tasks]
        _write_md(
            self._archive_file,
            _render_md_sections(sections),
        )

    # -- queries -------------------------------------------------

    def list_tasks(
        self,
        status=None,
        customer=None,
        tag=None,
        include_done=False,
    ) -> list[dict]:
        tasks = self._load_tasks()
        if not include_done:
            tasks = [
                t for t in tasks
                if t.get("status", "") != "DONE"
            ]
        if status:
            allowed = (
                status if isinstance(status, list)
                else [status]
            )
            tasks = [
                t for t in tasks
                if t.get("status") in allowed
            ]
        if customer:
            low = customer.lower()
            tasks = [
                t for t in tasks
                if t.get("customer", "").lower() == low
            ]
        if tag:
            tasks = [
                t for t in tasks
                if tag in t.get("tags", [])
            ]
        return tasks

    def list_all_tags(self) -> list[dict]:
        tasks = self._load_tasks()
        counter: Counter = Counter()
        for t in tasks:
            for tg in t.get("tags", []):
                counter[tg] += 1
        return [
            {"name": name, "count": count}
            for name, count in counter.most_common()
        ]

    def list_archived(self) -> list[dict]:
        return self._load_archive()

    # -- mutations -----------------------------------------------

    def add_task(
        self,
        customer,
        title,
        status="TODO",
        tags=None,
        body=None,
        github_url=None,
    ) -> dict:
        tasks = self._load_tasks()
        task = {
            "id": _generate_id(title),
            "customer": customer,
            "title": title,
            "status": status,
            "tags": tags or [],
            "body": body or "",
            "github_url": github_url or "",
            "properties": {},
            "created": datetime.now().isoformat(),
        }
        tasks.insert(0, task)
        self._save_tasks(tasks)
        return task

    def move_task(self, task_id, new_status) -> dict:
        tasks = self._load_tasks()
        for t in tasks:
            if t["id"] == task_id:
                t["status"] = new_status
                self._save_tasks(tasks)
                return t
        raise ValueError(f"Task not found: {task_id}")

    def set_tags(self, task_id, tags) -> dict:
        tasks = self._load_tasks()
        for t in tasks:
            if t["id"] == task_id:
                t["tags"] = list(tags)
                self._save_tasks(tasks)
                return t
        raise ValueError(f"Task not found: {task_id}")

    def reorder_tasks(
        self, task_ids: list[str],
    ) -> list[dict]:
        tasks = self._load_tasks()
        by_id = {t["id"]: t for t in tasks}
        reordered = [
            by_id[tid] for tid in task_ids
            if tid in by_id
        ]
        rest = [
            t for t in tasks
            if t["id"] not in set(task_ids)
        ]
        self._save_tasks(reordered + rest)
        return self._load_tasks()

    def update_task(
        self,
        task_id,
        title=None,
        customer=None,
        body=None,
        github_url=None,
    ) -> dict:
        tasks = self._load_tasks()
        for t in tasks:
            if t["id"] == task_id:
                if title is not None:
                    t["title"] = title
                if customer is not None:
                    t["customer"] = customer
                if body is not None:
                    t["body"] = body
                if github_url is not None:
                    t["github_url"] = github_url
                self._save_tasks(tasks)
                return t
        raise ValueError(f"Task not found: {task_id}")

    def archive_task(self, task_id) -> bool:
        tasks = self._load_tasks()
        target = None
        remaining = []
        for t in tasks:
            if t["id"] == task_id:
                target = t
            else:
                remaining.append(t)
        if target is None:
            return False
        archive = self._load_archive()
        target["archived_at"] = (
            datetime.now().isoformat()
        )
        target["archive_status"] = target.get(
            "status", ""
        )
        archive.append(target)
        self._save_tasks(remaining)
        self._save_archive(archive)
        return True

    def unarchive_task(self, task_id: str) -> bool:
        archive = self._load_archive()
        target = None
        remaining = []
        for t in archive:
            if t["id"] == task_id:
                target = t
            else:
                remaining.append(t)
        if target is None:
            return False
        target.pop("archived_at", None)
        target.pop("archive_status", None)
        tasks = self._load_tasks()
        tasks.append(target)
        self._save_archive(remaining)
        self._save_tasks(tasks)
        return True


# -- Clock heading helpers ------------------------------------------

_TIME_HEADING_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})\s+"
    r"(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}|running)$"
)


def _group_key(entry: dict) -> str:
    """Key for grouping entries: [customer] - description."""
    return (
        f"[{entry.get('customer', '')}] - "
        f"{entry.get('description', '')}"
    )


def _parse_group_heading(heading: str) -> dict:
    """Parse '[CUSTOMER] - Description' heading."""
    m = re.match(r"^\[([^\]]*)\]\s*-\s*(.*)", heading)
    if m:
        return {
            "customer": m.group(1).strip(),
            "description": m.group(2).strip(),
        }
    return {"customer": heading.strip(), "description": ""}


def _time_heading(entry: dict) -> str:
    """Build level-3 heading: 2026-04-06 10:00 - 11:00."""
    start = entry.get("start", "")
    end = entry.get("end")
    s_dt = datetime.fromisoformat(start) if start else None
    if s_dt is None:
        return "unknown"
    date_str = s_dt.strftime("%Y-%m-%d")
    start_time = s_dt.strftime("%H:%M")
    if end:
        e_dt = datetime.fromisoformat(end)
        end_time = e_dt.strftime("%H:%M")
    else:
        end_time = "running"
    return f"{date_str} {start_time} - {end_time}"


def _parse_time_heading(heading: str) -> dict:
    """Parse '2026-04-06 10:00 - 11:00' heading."""
    m = _TIME_HEADING_RE.match(heading.strip())
    if not m:
        return {"start": "", "end": None}
    d, st, et = m.group(1), m.group(2), m.group(3)
    start = f"{d}T{st}:00"
    end = f"{d}T{et}:00" if et != "running" else None
    return {"start": start, "end": end}


def _load_clock_entries(text: str) -> list[dict]:
    """Parse grouped clock markdown into flat entry list.

    Uses raw splitting by heading level to avoid the generic
    parser consuming sub-headings as HTML comment metadata.
    """
    entries = []
    group_chunks = re.split(r"(?m)^## ", text)
    for chunk in group_chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        first_nl = chunk.find("\n")
        heading = (
            chunk[:first_nl].strip()
            if first_nl != -1
            else chunk.strip()
        )
        parsed = _parse_group_heading(heading)
        rest = (
            chunk[first_nl + 1:] if first_nl != -1
            else ""
        )
        sub_chunks = re.split(r"(?m)^### ", rest)
        for sc in sub_chunks:
            sc = sc.strip()
            if not sc:
                continue
            sub_secs = _parse_md_sections(
                f"### {sc}", level=3
            )
            for sub in sub_secs:
                times = _parse_time_heading(
                    sub["heading"]
                )
                if not times["start"]:
                    continue
                meta = sub.get("meta", {})
                entries.append({
                    "customer": parsed["customer"],
                    "description": (
                        parsed["description"]
                    ),
                    "start": times["start"],
                    "end": times["end"],
                    "task_id": meta.get("task_id", ""),
                    "contract": meta.get(
                        "contract", ""
                    ),
                    "booked": meta.get(
                        "booked", ""
                    ) == "true",
                    "notes": sub.get(
                        "body", ""
                    ).strip(),
                })
    return entries


def _clock_entry_props(entry: dict) -> dict:
    """Build props dict for a single clock entry."""
    props = {}
    if entry.get("task_id"):
        props["task_id"] = entry["task_id"]
    if entry.get("contract"):
        props["contract"] = entry["contract"]
    if entry.get("booked"):
        props["booked"] = "true"
    return props


def _save_clock_entries(
    path: Path, entries: list[dict]
) -> None:
    """Write entries grouped by customer/description."""
    groups: dict[str, list[dict]] = {}
    for e in entries:
        key = _group_key(e)
        groups.setdefault(key, []).append(e)

    parts = []
    for key, group_entries in groups.items():
        lines = [f"## {key}"]
        for e in group_entries:
            lines.append("")
            lines.append(f"### {_time_heading(e)}")
            prop_block = _render_props(
                _clock_entry_props(e)
            )
            if prop_block:
                lines.append(prop_block)
            if e.get("notes"):
                lines.append("")
                lines.append(e["notes"])
        parts.append("\n".join(lines))
    _write_md(
        path,
        "\n\n".join(parts) + "\n" if parts else "",
    )


# ====================================================================
#  ClockBackend
# ====================================================================


class MarkdownClockBackend(ClockBackend):
    def __init__(self, clocks_file: Path) -> None:
        self._clocks_file = clocks_file

    @property
    def data_file(self) -> Path:
        return self._clocks_file

    def _load_entries(self) -> list[dict]:
        text = _read_md(self._clocks_file)
        return _load_clock_entries(text)

    def _save_entries(
        self, entries: list[dict]
    ) -> None:
        _save_clock_entries(self._clocks_file, entries)

    # -- helpers -------------------------------------------------

    def _duration_minutes(self, entry: dict) -> int:
        start = datetime.fromisoformat(entry["start"])
        end_str = entry.get("end")
        if not end_str:
            end = _local_now()
        else:
            end = datetime.fromisoformat(end_str)
        return max(
            0, int((end - start).total_seconds() / 60)
        )

    def _enrich(self, entry: dict) -> dict:
        entry["duration_minutes"] = (
            self._duration_minutes(entry)
        )
        return entry

    # -- queries -------------------------------------------------

    def list_entries(
        self,
        period="today",
        customer=None,
        from_date: date | None = None,
        to_date: date | None = None,
        task_id=None,
        contract=None,
    ) -> list[dict]:
        entries = self._load_entries()
        if task_id:
            entries = [
                e for e in entries
                if e.get("task_id") == task_id
            ]
        elif from_date or to_date:
            sd = from_date or date.min
            ed = to_date or date.max
            entries = [
                e for e in entries
                if _entry_in_range(e, sd, ed)
            ]
        else:
            sd, ed = _period_range(period)
            entries = [
                e for e in entries
                if _entry_in_range(e, sd, ed)
            ]
        if customer:
            low = customer.lower()
            entries = [
                e for e in entries
                if e.get("customer", "").lower() == low
            ]
        if contract:
            entries = [
                e for e in entries
                if e.get("contract") == contract
            ]
        return [self._enrich(e) for e in entries]

    def get_active(self) -> dict | None:
        for entry in self._load_entries():
            if entry.get("end") is None:
                return self._enrich(entry)
        return None

    def get_summary(self, period="month") -> list[dict]:
        entries = self.list_entries(period=period)
        totals: dict[str, int] = {}
        for e in entries:
            cust = e.get("customer", "unknown")
            totals[cust] = (
                totals.get(cust, 0)
                + e["duration_minutes"]
            )
        return [
            {
                "customer": cust,
                "minutes": mins,
                "hours": round(mins / 60, 2),
            }
            for cust, mins in sorted(totals.items())
        ]

    # -- mutations -----------------------------------------------

    def start(
        self,
        customer,
        description,
        task_id=None,
        contract=None,
    ) -> dict:
        if self.get_active() is not None:
            raise ValueError(
                "A clock entry is already running"
            )
        entries = self._load_entries()
        entry = {
            "customer": customer,
            "description": description,
            "start": _local_now().isoformat(),
            "end": None,
            "task_id": task_id or "",
            "contract": contract or "",
            "booked": False,
            "notes": "",
        }
        entries.append(entry)
        self._save_entries(entries)
        return self._enrich(entry)

    def stop(self) -> dict:
        entries = self._load_entries()
        for entry in entries:
            if entry.get("end") is None:
                entry["end"] = (
                    _local_now().isoformat()
                )
                self._save_entries(entries)
                return self._enrich(entry)
        raise ValueError("No running clock entry")

    def quick_book(
        self,
        duration_str,
        customer,
        description,
        task_id=None,
        contract=None,
        target_date=None,
    ) -> dict:
        minutes = _parse_duration_minutes(duration_str)
        if not target_date:
            target_date = date.today()
        start = datetime(
            target_date.year, target_date.month,
            target_date.day, 12, 0, 0,
        )
        end = start + timedelta(minutes=minutes)
        entries = self._load_entries()
        entry = {
            "customer": customer,
            "description": description,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "task_id": task_id or "",
            "contract": contract or "",
            "booked": False,
            "notes": "",
        }
        entries.append(entry)
        self._save_entries(entries)
        return self._enrich(entry)

    def update_entry(
        self,
        start_iso: str,
        customer: str | None = None,
        description: str | None = None,
        hours: float | None = None,
        new_date=None,
        start_time: str | None = None,
        task_id: str | None = None,
        booked: bool | None = None,
        notes: str | None = None,
        contract: str | None = None,
    ) -> dict | None:
        entries = self._load_entries()
        for entry in entries:
            if entry.get("start") != start_iso:
                continue
            if customer is not None:
                entry["customer"] = customer
            if description is not None:
                entry["description"] = description
            if task_id is not None:
                entry["task_id"] = task_id
            if booked is not None:
                entry["booked"] = booked
            if notes is not None:
                entry["notes"] = notes
            if contract is not None:
                entry["contract"] = contract
            if start_time is not None:
                old_start = datetime.fromisoformat(
                    entry["start"]
                )
                h, m = (
                    int(x)
                    for x in start_time.split(":")
                )
                new_start = old_start.replace(
                    hour=h, minute=m,
                )
                delta = new_start - old_start
                entry["start"] = (
                    new_start.isoformat()
                )
                if entry.get("end"):
                    old_end = datetime.fromisoformat(
                        entry["end"]
                    )
                    entry["end"] = (
                        old_end + delta
                    ).isoformat()
            if hours is not None:
                start_dt = datetime.fromisoformat(
                    entry["start"]
                )
                entry["end"] = (
                    start_dt + timedelta(hours=hours)
                ).isoformat()
            if new_date is not None:
                old_start = datetime.fromisoformat(
                    entry["start"]
                )
                new_start = old_start.replace(
                    year=new_date.year,
                    month=new_date.month,
                    day=new_date.day,
                )
                delta = new_start - old_start
                entry["start"] = (
                    new_start.isoformat()
                )
                if entry.get("end"):
                    old_end = datetime.fromisoformat(
                        entry["end"]
                    )
                    entry["end"] = (
                        old_end + delta
                    ).isoformat()
            self._save_entries(entries)
            return self._enrich(entry)
        return None

    def delete_entry(self, start_iso) -> bool:
        entries = self._load_entries()
        new = [
            e for e in entries
            if e.get("start") != start_iso
        ]
        if len(new) == len(entries):
            return False
        self._save_entries(new)
        return True


# -- Inbox heading helpers ------------------------------------------


def _inbox_heading(item: dict) -> str:
    """Build heading: TYPE [CUSTOMER] Title."""
    itype = item.get("type") or "note"
    customer = item.get("customer") or ""
    title = item.get("title", "")
    if customer:
        return f"{itype} [{customer}] {title}"
    return f"{itype} {title}"


def _parse_inbox_heading(heading: str) -> dict:
    """Extract type, customer, title from heading.

    Accepts any single uppercase/lowercase word as type.
    Format: TYPE [CUSTOMER] Title  or  TYPE Title
    """
    # With customer: TYPE [CUSTOMER] Title
    m = re.match(
        r"(\S+)\s+\[([^\]]*)\]\s+(.*)", heading,
    )
    if m:
        return {
            "type": m.group(1),
            "customer": m.group(2),
            "title": m.group(3),
        }
    # Without customer: WORD Rest...
    # First word is the type if it's a single token
    # (no spaces, no special chars except hyphen)
    m2 = re.match(r"([A-Za-z][\w-]*)\s+(.*)", heading)
    if m2:
        return {
            "type": m2.group(1),
            "customer": "",
            "title": m2.group(2),
        }
    return {
        "type": "note",
        "customer": "",
        "title": heading,
    }


def _props_to_inbox_meta(meta: dict) -> dict:
    """Extract inbox fields and properties from props.

    Lines prefixed with ``prop_`` become entries in the
    ``properties`` sub-dict.
    """
    properties = {}
    plain = {}
    for k, v in meta.items():
        if k.startswith("prop_"):
            properties[k[5:]] = v
        else:
            plain[k] = v
    plain["properties"] = properties
    return plain


def _inbox_meta_to_props(meta: dict) -> dict:
    """Flatten inbox meta + properties into prop lines."""
    out = {}
    for k, v in meta.items():
        if k == "properties":
            continue
        out[k] = v
    for k, v in meta.get("properties", {}).items():
        out[f"prop_{k}"] = v
    return out


def _section_to_inbox(sec: dict) -> dict:
    """Convert a parsed section to an inbox dict.

    Auto-generates an ID if missing (manually added).
    """
    parsed = _parse_inbox_heading(sec["heading"])
    meta = _props_to_inbox_meta(sec.get("meta", {}))
    iid = meta.get("id", "")
    if not iid:
        iid = _generate_id(parsed["title"])
        meta["id"] = iid
        sec["meta"] = _inbox_meta_to_props(meta)
    return {
        "id": iid,
        "type": parsed["type"],
        "customer": parsed["customer"],
        "title": parsed["title"],
        "body": sec.get("body", ""),
        "channel": meta.get("channel", ""),
        "direction": meta.get("direction", ""),
        "created": meta.get("created", ""),
        "properties": meta.get("properties", {}),
    }


def _inbox_to_section(item: dict) -> dict:
    """Convert an inbox dict to a section dict."""
    meta = {
        "id": item.get("id", ""),
        "created": item.get("created", ""),
        "channel": item.get("channel", ""),
        "direction": item.get("direction", ""),
    }
    if item.get("properties"):
        meta["properties"] = item["properties"]
    props = _inbox_meta_to_props(meta)
    return {
        "heading": _inbox_heading(item),
        "meta": props,
        "body": item.get("body", ""),
    }


# ====================================================================
#  InboxBackend
# ====================================================================


class MarkdownInboxBackend(InboxBackend):
    def __init__(self, inbox_file: Path) -> None:
        self._inbox_file = inbox_file

    @property
    def data_file(self) -> Path:
        return self._inbox_file

    def _load_items(self) -> list[dict]:
        text = _read_md(self._inbox_file)
        sections = _parse_md_sections(text)
        had_missing = any(
            not s.get("meta", {}).get("id")
            for s in sections
        )
        items = [
            _section_to_inbox(s) for s in sections
        ]
        if had_missing and items:
            self._save_items(items)
        return items

    def _save_items(self, items: list[dict]) -> None:
        sections = [
            _inbox_to_section(i) for i in items
        ]
        _write_md(
            self._inbox_file,
            _render_md_sections(sections),
        )

    def list_items(self) -> list[dict]:
        return self._load_items()

    def add_item(
        self,
        text,
        item_type=None,
        customer=None,
        body=None,
        channel=None,
        direction=None,
    ) -> dict:
        items = self._load_items()
        item = {
            "id": _generate_id(text),
            "type": (
                item_type or _guess_inbox_type(text)
            ),
            "customer": customer or "",
            "title": text,
            "body": body or "",
            "channel": channel or "",
            "direction": direction or "",
            "created": datetime.now().isoformat(),
            "properties": {},
        }
        items.append(item)
        self._save_items(items)
        return item

    def remove_item(self, item_id) -> bool:
        items = self._load_items()
        new = [
            i for i in items
            if i.get("id") != item_id
        ]
        if len(new) == len(items):
            return False
        self._save_items(new)
        return True

    def update_item(self, item_id, updates) -> dict:
        items = self._load_items()
        for item in items:
            if item.get("id") == item_id:
                item.update(updates)
                self._save_items(items)
                return item
        raise ValueError(
            f"Inbox item not found: {item_id}"
        )

    def promote_to_task(
        self, item_id, tasks, customer
    ) -> dict:
        items = self._load_items()
        target = None
        remaining = []
        for item in items:
            if item.get("id") == item_id:
                target = item
            else:
                remaining.append(item)
        if target is None:
            raise ValueError(
                f"Inbox item not found: {item_id}"
            )
        task = tasks.add_task(
            customer=customer,
            title=target.get("title", ""),
            status="TODO",
            body=target.get("body") or None,
        )
        self._save_items(remaining)
        return task


# -- Note heading helpers -------------------------------------------


def _note_heading(note: dict) -> str:
    """Build heading: Title    :tags:."""
    base = note.get("title", "Untitled")
    return _append_tags(base, note.get("tags", []))


def _section_to_note(sec: dict) -> dict:
    """Convert a parsed section to a note dict.

    Auto-generates an ID if the metadata block has none
    (e.g. for manually created notes).
    """
    text, tags = _strip_tags(sec["heading"])
    meta = sec.get("meta", {})
    nid = meta.get("id", "")
    if not nid:
        nid = _generate_id(text)
        meta["id"] = nid
        sec["meta"] = meta
    return {
        "id": nid,
        "title": text,
        "body": sec.get("body", ""),
        "customer": meta.get("customer", ""),
        "task_id": meta.get("task_id") or None,
        "tags": tags,
        "created": meta.get("created", ""),
    }


def _note_to_section(note: dict) -> dict:
    """Convert a note dict to a section dict."""
    meta = {
        "id": note.get("id", ""),
        "customer": note.get("customer", ""),
        "created": note.get("created", ""),
    }
    if note.get("task_id"):
        meta["task_id"] = note["task_id"]
    return {
        "heading": _note_heading(note),
        "meta": meta,
        "body": note.get("body", ""),
    }


# ====================================================================
#  NotesBackend
# ====================================================================


class MarkdownNotesBackend(NotesBackend):
    def __init__(self, notes_file: Path) -> None:
        self._notes_file = notes_file

    @property
    def data_file(self) -> Path:
        return self._notes_file

    def _load_notes(self) -> list[dict]:
        text = _read_md(self._notes_file)
        sections = _parse_md_sections(text)
        had_missing = any(
            not s.get("meta", {}).get("id")
            for s in sections
        )
        notes = [_section_to_note(s) for s in sections]
        if had_missing and notes:
            self._save_notes(notes)
        return notes

    def _save_notes(self, notes: list[dict]) -> None:
        sections = [
            _note_to_section(n) for n in notes
        ]
        _write_md(
            self._notes_file,
            _render_md_sections(sections),
        )

    def list_notes(self) -> list[dict]:
        return self._load_notes()

    def add_note(
        self, title, body="", customer=None,
        tags=None, task_id=None,
    ) -> dict:
        notes = self._load_notes()
        note = {
            "id": _generate_id(title),
            "title": title,
            "body": body,
            "customer": customer or "",
            "task_id": task_id or None,
            "tags": tags or [],
            "created": datetime.now().isoformat(),
        }
        notes.append(note)
        self._save_notes(notes)
        return note

    def delete_note(self, note_id) -> bool:
        notes = self._load_notes()
        new = [
            n for n in notes
            if n.get("id") != note_id
        ]
        if len(new) == len(notes):
            return False
        self._save_notes(new)
        return True

    def update_note(self, note_id, updates) -> dict:
        notes = self._load_notes()
        for note in notes:
            if note.get("id") == note_id:
                note.update(updates)
                self._save_notes(notes)
                return note
        raise ValueError(
            f"Note not found: {note_id}"
        )

    def promote_to_task(
        self, note_id, tasks, customer
    ) -> dict:
        notes = self._load_notes()
        target = None
        remaining = []
        for note in notes:
            if note.get("id") == note_id:
                target = note
            else:
                remaining.append(note)
        if target is None:
            raise ValueError(
                f"Note not found: {note_id}"
            )
        task = tasks.add_task(
            customer=customer,
            title=target.get("title", ""),
            status="TODO",
            tags=target.get("tags") or None,
            body=target.get("body") or None,
        )
        self._save_notes(remaining)
        return task


# -- Customer heading helpers ---------------------------------------


def _parse_customer_tags(raw: str) -> list[str]:
    """Parse a comma-separated or JSON-like tag string."""
    raw = raw.strip()
    if not raw or raw == "[]":
        return []
    # Handle JSON-style list: ["a", "b"]
    if raw.startswith("["):
        raw = raw.strip("[]")
    return [
        t.strip().strip("\"'")
        for t in raw.split(",")
        if t.strip().strip("\"'")
    ]


def _section_to_customer(sec: dict) -> dict:
    """Convert a level-2 section to a customer dict."""
    meta = sec.get("meta", {})
    body = sec.get("body", "")
    contracts = []
    if body:
        contract_secs = _parse_md_sections(
            body, level=3
        )
        for csec in contract_secs:
            cmeta = csec.get("meta", {})
            contracts.append({
                "name": csec["heading"],
                "budget": _num(cmeta.get(
                    "budget",
                    cmeta.get("kontingent", 0),
                )),
                "start_date": cmeta.get(
                    "start_date", ""
                ),
                "end_date": cmeta.get(
                    "end_date", ""
                ),
                "used_offset": _num(cmeta.get(
                    "used_offset",
                    cmeta.get(
                        "verbraucht_offset", 0
                    ),
                )),
                "notes": csec.get("body", ""),
            })
    tags_raw = meta.get("tags", "")
    if isinstance(tags_raw, str):
        tags = _parse_customer_tags(tags_raw)
    else:
        tags = list(tags_raw)
    return {
        "name": sec["heading"],
        "status": meta.get("status", "active"),
        "type": meta.get("type", ""),
        "color": meta.get("color", ""),
        "budget": _num(meta.get(
            "budget", meta.get("kontingent", 0)
        )),
        "used_offset": _num(meta.get(
            "used_offset",
            meta.get("verbraucht_offset", 0),
        )),
        "repo": meta.get("repo", ""),
        "tags": tags,
        "properties": {},
        "contracts": contracts,
    }


def _num(val) -> int | float:
    """Coerce a string or numeric value to a number."""
    if isinstance(val, (int, float)):
        return val
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return 0
        try:
            return int(val)
        except ValueError:
            return float(val)
    return 0


def _render_tags_value(tags: list[str]) -> str:
    """Render tags list as a comma-separated string."""
    if not tags:
        return ""
    return ", ".join(tags)


def _customer_to_section(cust: dict) -> dict:
    """Convert a customer dict to a section dict."""
    meta = {
        "status": cust.get("status", "active"),
        "type": cust.get("type", ""),
        "color": cust.get("color", ""),
        "budget": cust.get("budget", 0),
        "used_offset": cust.get("used_offset", 0),
        "repo": cust.get("repo", ""),
        "tags": _render_tags_value(
            cust.get("tags", [])
        ),
    }

    # Render contracts as level-3 subsections
    contract_parts = []
    for con in cust.get("contracts", []):
        cmeta = {
            "budget": con.get("budget", 0),
            "start_date": con.get("start_date", ""),
            "end_date": con.get("end_date", ""),
            "used_offset": con.get("used_offset", 0),
        }
        lines = [f"### {con['name']}"]
        prop_block = _render_props(cmeta)
        if prop_block:
            lines.append(prop_block)
        if con.get("notes"):
            lines.append("")
            lines.append(con["notes"])
        contract_parts.append("\n".join(lines))

    body = "\n\n".join(contract_parts)
    return {
        "heading": cust.get("name", ""),
        "meta": meta,
        "body": body,
    }


# ====================================================================
#  CustomerBackend
# ====================================================================


class MarkdownCustomerBackend(CustomerBackend):
    def __init__(
        self, customers_file: Path, clocks_file: Path
    ) -> None:
        self._customers_file = customers_file
        self._clocks_file = clocks_file

    @property
    def data_file(self) -> Path:
        return self._customers_file

    def _load_customers(self) -> list[dict]:
        text = _read_md(self._customers_file)
        sections = _parse_md_sections(text)
        return [
            _section_to_customer(s)
            for s in sections
        ]

    def _save_customers(
        self, custs: list[dict]
    ) -> None:
        sections = [
            _customer_to_section(c) for c in custs
        ]
        _write_md(
            self._customers_file,
            _render_md_sections(sections),
        )

    def _load_clock_entries(self) -> list[dict]:
        text = _read_md(self._clocks_file)
        return _load_clock_entries(text)

    # -- helpers -------------------------------------------------

    def _used_hours(self, customer_name: str) -> float:
        entries = self._load_clock_entries()
        total_min = 0
        low = customer_name.lower()
        for e in entries:
            if e.get("customer", "").lower() != low:
                continue
            start_str = e.get("start")
            end_str = e.get("end")
            if not start_str or not end_str:
                continue
            start = datetime.fromisoformat(start_str)
            end = datetime.fromisoformat(end_str)
            total_min += max(
                0,
                int(
                    (end - start).total_seconds() / 60
                ),
            )
        return round(total_min / 60, 2)

    def _contract_used_hours(
        self, customer_name: str, contract_name: str
    ) -> float:
        entries = self._load_clock_entries()
        total_min = 0
        low = customer_name.lower()
        for e in entries:
            if e.get("customer", "").lower() != low:
                continue
            if e.get("contract") != contract_name:
                continue
            start_str = e.get("start")
            end_str = e.get("end")
            if not start_str or not end_str:
                continue
            start = datetime.fromisoformat(start_str)
            end = datetime.fromisoformat(end_str)
            total_min += max(
                0,
                int(
                    (end - start).total_seconds() / 60
                ),
            )
        return round(total_min / 60, 2)

    def _enrich_customer(self, cust: dict) -> dict:
        hours = self._used_hours(cust["name"])
        budget = cust.get("budget", 0)
        cust["used"] = hours
        cust["rest"] = round(
            budget - hours, 2
        )
        return cust

    def _enrich_contract(
        self, cust_name: str, con: dict
    ) -> dict:
        hours = self._contract_used_hours(
            cust_name, con["name"]
        )
        budget = con.get("budget", 0)
        con["used"] = hours
        con["rest"] = round(budget - hours, 2)
        con.setdefault("billable", True)
        con.setdefault("invoiced", False)
        return con

    # -- queries -------------------------------------------------

    def list_customers(
        self, include_inactive=False
    ) -> list[dict]:
        custs = self._load_customers()
        if not include_inactive:
            custs = [
                c for c in custs
                if c.get("status", "active") == "active"
            ]
        return [
            self._enrich_customer(c) for c in custs
        ]

    def get_customer(self, name) -> dict | None:
        custs = self._load_customers()
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() == low:
                return self._enrich_customer(c)
        return None

    def get_budget_summary(self) -> list[dict]:
        custs = self.list_customers(
            include_inactive=False
        )
        result = []
        for c in custs:
            raw_contracts = c.get("contracts", [])
            if raw_contracts:
                enriched = [
                    self._enrich_contract(
                        c["name"], con
                    )
                    for con in raw_contracts
                    if not con.get("end_date")
                ]
                budget = sum(
                    ct.get("budget", 0)
                    for ct in enriched
                )
                rest = sum(
                    ct.get("rest", 0)
                    for ct in enriched
                )
            else:
                enriched = []
                budget = c.get("budget", 0)
                rest = c.get("rest", 0)
            percent = (
                int((rest / budget) * 100)
                if budget
                else 0
            )
            result.append({
                "name": c["name"],
                "budget": budget,
                "rest": rest,
                "percent": percent,
                "contracts": enriched,
            })
        return result

    # -- mutations -----------------------------------------------

    def add_customer(
        self,
        name,
        status="active",
        customer_type="",
        budget=0,
        color="",
        repo=None,
        tags=None,
    ) -> dict:
        custs = self._load_customers()
        for c in custs:
            if c.get("name", "").lower() == name.lower():
                raise ValueError(
                    f"Customer already exists: {name}"
                )
        cust = {
            "name": name,
            "status": status,
            "type": customer_type,
            "color": color,
            "tags": tags or [],
            "budget": budget,
            "repo": repo or "",
            "used": 0,
            "rest": budget,
            "properties": {},
            "contracts": [],
        }
        custs.append(cust)
        self._save_customers(custs)
        return self._enrich_customer(cust)

    def update_customer(
        self, name, updates
    ) -> dict | None:
        custs = self._load_customers()
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() == low:
                for key in (
                    "name", "status",
                    "budget", "repo", "color",
                ):
                    if key in updates:
                        c[key] = updates[key]
                self._save_customers(custs)
                return self._enrich_customer(c)
        return None

    # -- contracts -----------------------------------------------

    def list_contracts(self, name) -> list[dict]:
        custs = self._load_customers()
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() == low:
                contracts = c.get("contracts", [])
                return [
                    self._enrich_contract(
                        c["name"], con
                    )
                    for con in contracts
                ]
        return []

    def add_contract(
        self,
        name,
        contract_name,
        budget,
        start_date,
        notes="",
        billable=True,
        invoiced=False,
    ) -> dict:
        custs = self._load_customers()
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() != low:
                continue
            contracts = c.setdefault("contracts", [])
            for con in contracts:
                if con["name"] == contract_name:
                    raise ValueError(
                        "Contract already exists: "
                        f"{contract_name}"
                    )
            contract = {
                "name": contract_name,
                "budget": budget,
                "start_date": start_date,
                "end_date": "",
                "notes": notes,
                "billable": billable,
                "invoiced": invoiced,
            }
            contracts.append(contract)
            self._save_customers(custs)
            return self._enrich_contract(
                c["name"], contract
            )
        raise ValueError(
            f"Customer not found: {name}"
        )

    def update_contract(
        self, name, contract_name, updates
    ) -> dict | None:
        custs = self._load_customers()
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() != low:
                continue
            for con in c.get("contracts", []):
                if con["name"] == contract_name:
                    for key in (
                        "name", "budget",
                        "start_date", "end_date",
                        "notes", "billable", "invoiced",
                    ):
                        if key in updates:
                            con[key] = updates[key]
                    self._save_customers(custs)
                    if (
                        "name" in updates
                        and updates["name"] != contract_name
                    ):
                        self._rename_contract_in_clocks(
                            contract_name,
                            updates["name"],
                        )
                    return self._enrich_contract(
                        c["name"], con
                    )
            return None
        return None

    def _rename_contract_in_clocks(
        self, old_name: str, new_name: str,
    ) -> None:
        entries = self._load_entries()
        changed = False
        for e in entries:
            if e.get("contract") == old_name:
                e["contract"] = new_name
                changed = True
        if changed:
            self._save_entries(entries)

    def close_contract(
        self, name, contract_name, end_date
    ) -> dict | None:
        return self.update_contract(
            name, contract_name,
            {"end_date": end_date},
        )

    def delete_customer(self, name) -> bool:
        custs = self._load_customers()
        low = name.lower()
        new = [
            c for c in custs
            if c.get("name", "").lower() != low
        ]
        if len(new) == len(custs):
            return False
        self._save_customers(new)
        return True

    def delete_contract(
        self, name, contract_name
    ) -> bool:
        custs = self._load_customers()
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() != low:
                continue
            contracts = c.get("contracts", [])
            new = [
                con for con in contracts
                if con["name"] != contract_name
            ]
            if len(new) == len(contracts):
                return False
            c["contracts"] = new
            self._save_customers(custs)
            return True
        return False


# ====================================================================
#  Factory
# ====================================================================


def make_markdown_backend(cfg) -> tuple[
    TaskBackend, ClockBackend, InboxBackend,
    CustomerBackend, NotesBackend, list[Path],
]:
    """Build markdown backends from config paths."""
    md_dir = cfg.MARKDOWN_DIR.expanduser()
    md_dir.mkdir(parents=True, exist_ok=True)

    tasks = MarkdownTaskBackend(
        md_dir / "todos.md",
        md_dir / "archive.md",
    )
    clocks = MarkdownClockBackend(
        md_dir / "clocks.md"
    )
    inbox = MarkdownInboxBackend(
        md_dir / "inbox.md"
    )
    cust = MarkdownCustomerBackend(
        md_dir / "customers.md",
        md_dir / "clocks.md",
    )
    notes = MarkdownNotesBackend(
        md_dir / "notes.md"
    )
    watch_paths = [
        md_dir, cfg.SETTINGS_FILE.expanduser()
    ]
    return tasks, clocks, inbox, cust, notes, watch_paths
