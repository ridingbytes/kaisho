from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Clock:
    start: datetime
    end: datetime | None = None
    duration: str | None = None


@dataclass
class Heading:
    level: int
    keyword: str | None
    title: str
    tags: list[str] = field(default_factory=list)
    properties: dict[str, str] = field(default_factory=dict)
    logbook: list[Clock] = field(default_factory=list)
    body: list[str] = field(default_factory=list)
    children: list["Heading"] = field(default_factory=list)
    raw_lines: list[str] = field(default_factory=list)
    dirty: bool = False


@dataclass
class OrgFile:
    preamble: list[str] = field(default_factory=list)
    headings: list[Heading] = field(default_factory=list)
    path: str | None = None
