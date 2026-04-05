# OmniControl -- Architecture Concept

## Context

Ramon Bartl (RIDING BYTES GmbH) betreut mehrere SENAITE-LIMS-Kunden
parallel. Zeiterfassung, Tasks und Kundendaten liegen in org-mode
Dateien, die sowohl ueber Doom Emacs als auch ueber Claude Code
bearbeitet werden. Ein frueherer KI-Assistent (OpenClaw/Bruce) lief
ueber OpenRouter mit 17+ Cron-Jobs, war aber zu teuer und
inkonsistent. OmniControl ersetzt dieses System durch eine lokale
App mit Python-Backend, CLI und React-Frontend.

Ziel: Ein persoenliches Produktivitaets-System, das org-mode
Dateien als Single Source of Truth nutzt, bidirektional mit Emacs
synchronisiert, und autonome KI-Aufgaben ueber lokale Ollama-Modelle
und Claude CLI ausfuehren kann.

Ablageort: ~/develop/omnicontrol/
Implementierung: Claude Sonnet anhand dieses Konzepts.

## Architektur-Prinzip: CLI First

Die Architektur folgt einem strikten Schichtenmodell:

```
CLI (oc)  -->  Services  <--  FastAPI  <--  React Frontend
                  |
              Org-Files
```

1. **Services**: Reine Python-Funktionen die org-Dateien lesen/schreiben.
   Keine HTTP-Abhaengigkeit, kein Framework. Testbar ohne Server.
2. **CLI (oc)**: Command-Line Tool das die Services direkt aufruft.
   Sofort nutzbar, kein Server noetig.
3. **FastAPI**: Duenner HTTP-Layer ueber den Services. Kommt spaeter.
4. **React Frontend**: Web-UI ueber die FastAPI Endpoints. Kommt zuletzt.

Die CLI heisst `oc` (OmniControl) und wird als Python Entry Point
installiert. Sie ist das primaere Interface neben Emacs.

---

## 1. Project Structure

```
~/develop/omnicontrol/
  README.md
  CONCEPT.md                       # Dieses Dokument
  docker-compose.yml
  Makefile
  pyproject.toml                   # Projekt-Root, installiert `oc` CLI
  .python-version                  # 3.12.12
  settings.yaml                    # Tags, States, Farben (editierbar)

  omnicontrol/                     # Python Package
    __init__.py
    config.py                    # pydantic-settings

    org/                         # Org-mode parser library
      __init__.py
      parser.py                # Line-by-line AST builder
      writer.py                # AST to org text (round-trip)
      models.py                # OrgFile, Heading, Clock
      clock.py                 # Clock-specific parse/write

    services/                    # Business Logic (framework-agnostic)
      __init__.py
      kanban.py                # Task CRUD, state transitions
      clocks.py                # Clock parsing, quick-book, timer
      customers.py             # Budget calculation
      inbox.py                 # Capture + auto-categorize
      knowledge.py             # FTS index, file tree, search
      cron.py                  # Scheduler, executor
      dashboard.py             # Aggregation
      github.py                # gh CLI wrapper, issue cache
      communications.py        # Email/Comm history, SQLite
      settings.py              # settings.yaml CRUD

    cli/                         # CLI Commands (Click)
      __init__.py
      main.py                  # Click group, entry point `oc`
      task.py                  # oc task add/list/move/done/archive
      clock.py                 # oc clock book/start/stop/status/list
      customer.py              # oc customer list/show/summary
      inbox.py                 # oc inbox add/list/process
      knowledge.py             # oc kb search/list/show
      cron.py                  # oc cron list/trigger/history/add
      briefing.py              # oc briefing (Morgen-Uebersicht)
      gh.py                    # oc gh issues/pr/open
      comm.py                  # oc comm list/search/show
      tag.py                   # oc tag list/add/update/remove
      config_cmd.py            # oc config states/add-state/...
      advisor.py               # oc ask (AI Chat Advisor)

    api/                         # FastAPI (Phase 2, baut auf Services)
      __init__.py
      app.py                   # FastAPI app, lifespan, CORS
      routers/
        __init__.py
        kanban.py
        clocks.py
        customers.py
        inbox.py
        knowledge.py
        cron.py
        communications.py
        settings.py
        dashboard.py
        ws.py
      watcher/
        __init__.py
        service.py             # watchfiles-based file watcher
      ws/
        __init__.py
        manager.py             # WebSocket connection pool

    cron/                        # Cron engine
      __init__.py
      scheduler.py             # APScheduler cron runner
      executor.py              # Ollama + Claude execution
      models.py

  prompts/                       # Cron job prompt templates
    daily-briefing.md
    weekly-scout.md

  data/                          # Runtime (gitignored)
    omnicontrol.db             # SQLite: Knowledge FTS,
                               # Communications, Cron History
    gh_cache/                  # GitHub Issue Cache (JSON, TTL)

  jobs.yaml                      # Cron job definitions

  docs/                            # Dokumentation
    index.md
    quickstart.md
    installation.md
    cli/                         # Ein .md pro Command Group
      index.md
      task.md
      clock.md
      customer.md
      inbox.md
      comm.md
      gh.md
      kb.md
      cron.md
      briefing.md
      ask.md
    guides/                      # Workflow-Anleitungen
      email-workflow.md
      time-tracking.md
      github-integration.md
      cron-jobs.md
      emacs-integration.md
    reference/                   # Technische Referenz
      config.md
      org-format.md
      api.md
      websocket.md
      database.md
    architecture.md
    contributing.md

  tests/
    conftest.py
    test_org_parser.py
    test_org_writer.py
    test_clocks.py
    test_kanban.py
    test_customers.py
    test_communications.py
    test_cli.py

  frontend/
    package.json
    vite.config.ts
    tsconfig.json
    index.html
    src/
      main.tsx
      App.tsx
      api/
        client.ts
        ws.ts                # WebSocket + auto-reconnect
      hooks/
        useWebSocket.ts
        useKanban.ts
        useClocks.ts
        useCustomers.ts
        useInbox.ts
        useKnowledge.ts
        useCron.ts
        useSettings.ts
        useDashboard.ts
      pages/
        DashboardPage.tsx
        KanbanPage.tsx
        ClocksPage.tsx
        CustomersPage.tsx
        InboxPage.tsx
        KnowledgePage.tsx
        CronPage.tsx
        SettingsPage.tsx
      components/
        layout/
          Sidebar.tsx
          Layout.tsx
        kanban/
          Board.tsx
          Column.tsx
          Card.tsx
        clocks/
          ActiveTimer.tsx
          QuickBook.tsx
          RecentEntries.tsx
          BudgetOverview.tsx
        customers/
          CustomerList.tsx
          BudgetMeter.tsx
        inbox/
          CaptureForm.tsx
          InboxList.tsx
          AttachmentList.tsx
        communications/
          CommHistory.tsx
          CommSearch.tsx
        knowledge/
          FileTree.tsx
          SearchBar.tsx
          MarkdownViewer.tsx
        cron/
          JobList.tsx
          JobEditor.tsx
          ExecutionHistory.tsx
        github/
          IssueList.tsx
          IssueBadge.tsx
          RepoSelector.tsx
        settings/
          StateEditor.tsx
          TagEditor.tsx
          ColorPicker.tsx
        advisor/
          ChatPanel.tsx
          SuggestionCard.tsx
        dashboard/
          AgendaSummary.tsx
          ActiveTimerWidget.tsx
          BudgetMeters.tsx
          InboxBadge.tsx
          NextCronJobs.tsx
          ActivityFeed.tsx
          GitHubWidget.tsx
      styles/
        globals.css

  .gitignore
```

---

## 2. CLI (`oc`)

Die CLI wird ueber Click implementiert und als `oc` Entry Point
installiert (`pip install -e .`). Alle Commands rufen direkt die
Services-Schicht auf -- kein HTTP, kein Server noetig.

### 2.1 Installation

pyproject.toml definiert den Entry Point:
```toml
[project.scripts]
oc = "omnicontrol.cli.main:cli"
```

Nach `pip install -e .` ist `oc` im Terminal verfuegbar.

### 2.2 Commands

#### Tasks (`oc task`)

```bash
# Task anlegen
oc task add "CERMEL" "Geister-Samples loeschen" --tag issue
oc task add "ISC" "Meeting vorbereiten" --status NEXT --tag meeting
oc task add "SENAITE" "AT->DX Migration" --tag code --tag senaite

# Tasks auflisten
oc task list                    # Alle offenen Tasks
oc task list --customer CERMEL  # Nur CERMEL Tasks
oc task list --status TODO      # Nur TODO
oc task list --tag prio-high    # Nur prio-high
oc task list --tag code --customer CERMEL  # Kombiniert
oc task list --all              # Inkl. DONE und CANCELLED

# Task Status aendern
oc task move <id-oder-text> IN-PROGRESS
oc task done <id-oder-text>
oc task next <id-oder-text>     # -> NEXT
oc task wait <id-oder-text>     # -> WAIT
oc task cancel <id-oder-text>   # -> CANCELLED

# Tags aendern
oc task tag <id> code issue          # Tags setzen
oc task tag <id> +prio-high          # Tag hinzufuegen
oc task tag <id> -prio-low           # Tag entfernen

# Task archivieren (verschiebt nach archive.org)
oc task archive <id-oder-text>
```

Ausgabeformat (Tabelle mit Rich oder einfach Text):
```
TODO  [CERMEL]   Geister-Samples loeschen     :issue:prio-high:  2026-03-19
NEXT  [ISC]      Meeting vorbereiten           :meeting:          2026-04-01
WAIT  [LUNG-MV]  Rueckmeldung Dr. Klonus       :@email:reminder: 2026-03-19
```

Task-Identifikation: Entweder ueber die laufende Nummer in der
Anzeige (#1, #2, ...) oder ueber einen eindeutigen Textmatch.

#### Zeiterfassung (`oc clock`)

```bash
# Nachbuchen (Quick-Book)
oc clock book 2h CERMEL "Email Rueckmeldung"
oc clock book 30min ISC "Meeting Nachbereitung"
oc clock book 4h NRG-FMI "#15 Instrument setup"

# Timer starten/stoppen
oc clock start CERMEL "Update vorbereiten"
oc clock stop                   # Stoppt laufenden Timer
oc clock status                 # Zeigt laufenden Timer

# Eintraege auflisten
oc clock list                   # Heute
oc clock list --week            # Diese Woche
oc clock list --month           # Dieser Monat
oc clock list --customer IAEA   # Nur IAEA
oc clock list --from 2026-03-01 --to 2026-03-31

# Zusammenfassung pro Kunde
oc clock summary                # Diesen Monat
oc clock summary --week         # Diese Woche
```

Ausgabe `oc clock list`:
```
2026-03-31  NRG       4:00  Issue #15
2026-03-31  NRG       1:00  Issue #14
2026-03-30  LISCON    3:00  Migration Testserver
```

Ausgabe `oc clock summary`:
```
Kunde       Stunden   Budget   Rest
IAEA          26h     100h     74h
NRG FMI       21h     100h     79h
CERMEL         0h      80h     80h
LISCON        36h       0h      0h
ISC          295h       -       5h
Gesamt:      378h
```

#### Kunden (`oc customer`)

```bash
oc customer list                # Alle aktiven Kunden
oc customer list --all          # Inkl. Archiv
oc customer show IAEA           # Details eines Kunden
oc customer summary             # Budget-Uebersicht (wie oben)
```

#### Inbox (`oc inbox`)

```bash
# Eintrag hinzufuegen
oc inbox add "Email von CERMEL: Update auf 2.6 gewuenscht"
oc inbox add --type IDEE "SENAITE Marketplace fuer Add-ons"
oc inbox add --type LEAD "Anfrage von Labor XY aus Belgien"

# Einfach per Pipe (Email reinpasten)
echo "Von: Dr. Klonus ..." | oc inbox add -

# Auflisten
oc inbox list
oc inbox list --type EMAIL

# Inbox-Item zu Task machen
oc inbox promote <id> --customer CERMEL
```

Ausgabe `oc inbox list`:
```
#1  EMAIL  [CERMEL]  Update auf 2.6 gewuenscht    2026-04-01
#2  IDEE   [-]       SENAITE Marketplace           2026-04-01
#3  LEAD   [-]       Anfrage Labor XY              2026-04-01
```

#### Wissensdatenbank (`oc kb`)

```bash
oc kb search "docker senaite"   # Volltextsuche
oc kb list                      # Verzeichnisbaum
oc kb show senaite/security.md  # Datei anzeigen
```

#### Cron Jobs (`oc cron`)

```bash
oc cron list                    # Alle Jobs
oc cron trigger daily-briefing  # Manuell ausfuehren
oc cron history                 # Letzte Ausfuehrungen
oc cron history daily-briefing  # Fuer einen Job
oc cron add                     # Interaktiv neuen Job anlegen
oc cron enable/disable <id>
```

#### GitHub (`oc gh`)

```bash
# Issues auflisten (aus kunden.org Repo lesen)
oc gh issues CERMEL             # Offene Issues fuer CERMEL
oc gh issues CERMEL --all       # Inkl. geschlossene
oc gh issues --all-customers    # Alle Kunden-Repos

# Issue-Details
oc gh show CERMEL 42            # Issue #42 anzeigen

# Issue referenzieren in Task/Clock
oc task add "CERMEL" "Fix #42 Geister-Samples" --issue 42
oc clock book 2h CERMEL "#42 Debugging"

# PR Status
oc gh prs CERMEL                # Offene PRs
oc gh prs --mine                # Eigene PRs ueber alle Repos

# Im Browser oeffnen
oc gh open CERMEL               # Repo im Browser
oc gh open CERMEL 42            # Issue #42 im Browser
```

Ausgabe `oc gh issues CERMEL`:
```
ridingbytes/cermel.lims
#42  open   Geister-Samples bleiben sichtbar    2026-03-19
#38  open   SENAITE Update auf 2.6              2026-03-10
#35  closed Fix Barcode-Druck                   2026-02-28
```

Autocomplete: Tab-Completion fuer Kundennamen und Issue-Nummern.
Click Shell Completion generiert Vorschlaege aus kunden.org (Repos)
und cached Issues.

Repo-Mapping: Der Kundenname wird ueber kunden.org auf das GitHub
Repo aufgeloest (Property :REPO:). Kunden ohne :REPO: werden bei
`oc gh` uebersprungen.

#### AI Advisor (`oc ask`)

```bash
# Freie Frage an den KI-Advisor
oc ask "Was sollte ich heute angehen?"
oc ask "Welche CERMEL Issues haben Prioritaet?"
oc ask "Fasse meine Woche zusammen"

# Mit explizitem Modell
oc ask --model ollama:qwen3:14b "Plane meinen Tag"
oc ask --model claude:sonnet "Review meine offenen PRs"
```

Der Advisor hat vollen Zugriff auf:
- Offene Tasks (todos.org)
- Aktive Timer und Clock-History (clocks.org)
- Kunden-Budgets (kunden.org)
- Inbox (inbox.org)
- GitHub Issues aller Kunden-Repos (via `gh`)
- Knowledge Base (wissen/, research/)

Er kann ausserdem `oc` CLI Commands ausfuehren:
- Tasks anlegen/verschieben (`oc task add`, `oc task move`)
- Zeitbuchungen vornehmen (`oc clock book`)
- Inbox-Eintraege erstellen (`oc inbox add`)

Ausgabe:
```
=== AI Advisor (ollama:qwen3:14b) ===

Guten Morgen Ramon. Hier mein Vorschlag fuer heute:

1. ISC: Nur noch 5h Budget -- Rechnung vorbereiten?
   > 2 offene Issues (#18, #21), beide minor

2. CERMEL: Issue #42 (Geister-Samples) blockiert
   das SENAITE Update. Vorschlag: 2-3h einplanen.

3. IAEA: PR #7 wartet seit 5 Tagen auf Review.

Soll ich die Top-3 als NEXT Tasks anlegen?
> [j/n]
```

Wenn der User bestaetigt, fuehrt der Advisor die entsprechenden
`oc task` Commands aus und die Aenderungen erscheinen sofort
im Frontend (via WebSocket file_changed Event).

#### Briefing (`oc briefing`)

```bash
oc briefing                     # Morgen-Uebersicht
```

Ausgabe:
```
=== OmniControl Briefing (2026-04-01, Di) ===

--- Aktiver Timer ---
  (keiner)

--- Offene Tasks (5) ---
  TODO  [CERMEL]      Geister-Samples loeschen
  NEXT  [ISC]         Meeting vorbereiten
  WAIT  [LUNG-MV]     Rueckmeldung Dr. Klonus

--- Inbox (3 unbearbeitet) ---
  EMAIL  [CERMEL]     Update auf 2.6 gewuenscht

--- Budget-Stand ---
  IAEA       74h rest (74%)
  NRG FMI    79h rest (79%)
  CERMEL     80h rest (100%, unbezahlt)
  ILRI       15h rest (75%)
  ISC         5h rest (!)

--- GitHub (12 offene Issues) ---
  CERMEL     3 issues   (1 neu seit gestern)
  ISC        2 issues
  IAEA       4 issues   (PR #7 wartet auf Review)
  NRG FMI    3 issues

--- Naechste Cron Jobs ---
  09:30  Daily Briefing (ollama:qwen3)
  18:00  Business Scout (ollama:llama3.3)
```

#### Konfiguration (`oc config`)

```bash
# Task States anzeigen
oc config states
# TODO -> NEXT -> IN-PROGRESS -> WAIT -> DONE -> CANCELLED

# State hinzufuegen
oc config add-state REVIEW --label "Review" \
    --color "#a855f7" --after IN-PROGRESS

# State entfernen
oc config remove-state REVIEW

# State-Reihenfolge aendern
oc config move-state WAIT --after NEXT
```

#### Tags (`oc tag`)

```bash
# Alle Tags mit Farbe und Count
oc tag list

# Tag zur Config hinzufuegen (Autocomplete-Vorschlag)
oc tag add deployment --color "#10b981" \
    --description "Deployment-bezogen"

# Tag-Farbe/Beschreibung aendern
oc tag update code --color "#0ea5e9"

# Tag aus Config entfernen (nicht aus org-Dateien)
oc tag remove deployment
```

### 2.3 Ausgabeformatierung

Alle Commands unterstuetzen:
- `--json` Flag fuer maschinenlesbaren Output (JSON)
- `--quiet` Flag fuer minimalen Output (nur IDs/Werte)
- Default: Lesbare Tabellen/Listen (mit Rich oder tabellarisch)

Das `--json` Flag ist wichtig, damit die FastAPI Endpoints
spaeter die gleichen Services nutzen und die CLI auch von
Skripten aufgerufen werden kann.

### 2.4 Konfiguration

Die CLI liest die gleiche Config wie die API (`omnicontrol/config.py`).
Pfade koennen per Umgebungsvariable oder `.env` Datei im
Projektverzeichnis ueberschrieben werden.

```bash
# Optional: .env Datei
ORG_DIR=~/ownCloud/cowork/org
WISSEN_DIR=~/ownCloud/cowork/wissen
```

### 2.5 Shell-Alias Integration

Fuer schnellen Zugriff in der ZSH:
```bash
alias t="oc task"
alias c="oc clock"
alias b="oc briefing"
```

---

## 3. Tech Stack

### Backend

- fastapi >= 0.115
- uvicorn[standard]
- watchfiles (Rust-based, async, reliable on macOS)
- pydantic >= 2.0
- pydantic-settings
- apscheduler >= 3.10 (Cron scheduling)
- httpx (Ollama API)
- aiosqlite (FTS index + cron history)
- python-multipart
- pyyaml
- click (CLI Framework)
- click-completion (Shell Tab-Completion)

Python 3.12.12 via pyenv. Virtualenv: omnicontrol.

Systemvoraussetzung: `gh` CLI (GitHub CLI) installiert und
authentifiziert (`gh auth login`).

### Frontend

- react 19
- react-router v7
- zustand (State management, lightweight)
- @dnd-kit/core + sortable (Drag-drop fuer Kanban)
- react-markdown + rehype-raw (Markdown rendering)
- tailwind css (Styling)
- vite 6 (Build)
- typescript

---

## 4. Configuration (config.py)

pydantic-settings mit Env-Vars und Defaults:

| Setting         | Default                                                 |
|-----------------+---------------------------------------------------------|
| ORG_DIR         | ~/ownCloud/cowork/org                                   |
| WISSEN_DIR      | ~/ownCloud/cowork/wissen                                |
| RESEARCH_DIR    | ~/ownCloud/cowork/research                              |
| TODOS_FILE      | {ORG_DIR}/todos.org                                     |
| CLOCKS_FILE     | {ORG_DIR}/clocks.org                                    |
| KUNDEN_FILE     | {ORG_DIR}/kunden.org                                    |
| INBOX_FILE      | {ORG_DIR}/inbox.org                                     |
| ARCHIVE_FILE    | {ORG_DIR}/archive.org                                   |
| KUNDEN_DIR      | ~/ownCloud/cowork/kunden                                |
| JOBS_FILE       | ./jobs.yaml                                             |
| DATA_DIR        | ./data                                                  |
| DB_FILE         | {DATA_DIR}/omnicontrol.db                               |
| OLLAMA_BASE_URL | http://localhost:11434                                  |
| TASK_STATES     | ["TODO","NEXT","IN-PROGRESS","WAIT","DONE","CANCELLED"] |
| DONE_STATES     | ["DONE","CANCELLED"]                                    |
| DEFAULT_TAGS    | (siehe unten)                                           |
| HOST            | 0.0.0.0                                                 |
| PORT            | 8000                                                    |

---

## 5. API Endpoints

### Kanban (/api/kanban)

| Method | Path             | Beschreibung                                        |
|--------+------------------+-----------------------------------------------------|
| GET    | /tasks           | Tasks, Filter: ?status=&customer=&tag=              |
| POST   | /tasks           | Neuen Task anlegen                                  |
| PATCH  | /tasks/{id}      | Status, Titel oder Kunde aendern                    |
| DELETE | /tasks/{id}      | Task archivieren (nach archive.org)                 |
| GET    | /tags            | Alle bekannten Tags mit Counts                      |

Task-ID: SHA-256 von Heading-Text + CREATED-Timestamp.
Stabil ueber Re-Reads.

### Clocks (/api/clocks)

| Method | Path           | Beschreibung                                       |
|--------+----------------+----------------------------------------------------|
| GET    | /entries       | Alle Clock-Eintraege, Filter: ?period=&customer=   |
| PATCH  | /entries       | Clock-Eintrag aendern (?start=ISO)                 |
| DELETE | /entries       | Clock-Eintrag loeschen (?start=ISO)                |
| GET    | /active        | Aktuell laufender Timer (offener CLOCK)            |
| POST   | /start         | Timer starten                                      |
| POST   | /stop          | Timer stoppen                                      |
| POST   | /quick-book    | Retroaktiv buchen: {duration, customer, description} |
| GET    | /summary       | Nach Kunde gruppiert mit Summen                    |

### Customers (/api/customers)

| Method | Path                      | Beschreibung                        |
|--------+---------------------------+-------------------------------------|
| GET    | /                         | Alle Kunden mit Budget-Status       |
| GET    | /{name}                   | Einzelner Kunde mit Details         |
| PATCH  | /{name}                   | Kundendaten aendern (name, status, kontingent, repo) |
| GET    | /{name}/entries           | Zeiteintraege eines Kunden          |
| POST   | /{name}/entries           | Zeiteintrag anlegen                 |
| PATCH  | /{name}/entries/{id}      | Zeiteintrag aendern                 |
| DELETE | /{name}/entries/{id}      | Zeiteintrag loeschen                |

### Inbox (/api/inbox)

| Method | Path     | Beschreibung                           |
|--------+----------+----------------------------------------|
| GET    | /        | Alle Inbox-Items                       |
| POST   | /capture | Neuer Eintrag mit Auto-Kategorisierung |
| DELETE | /{id}    | Item loeschen/umordnen                 |

### Knowledge (/api/knowledge)

| Method | Path    | Beschreibung                              |
|--------+---------+-------------------------------------------|
| GET    | /tree   | Verzeichnisbaum wissen/ + research/       |
| GET    | /file   | ?path=senaite/security.md Markdown-Inhalt |
| GET    | /search | ?q=docker+senaite Volltextsuche           |

### Cron (/api/cron)

| Method | Path               | Beschreibung                      |
|--------+--------------------+-----------------------------------|
| GET    | /jobs              | Alle Job-Definitionen             |
| POST   | /jobs              | Neuen Job anlegen                 |
| PATCH  | /jobs/{id}         | Job aendern                       |
| DELETE | /jobs/{id}         | Job loeschen                      |
| POST   | /jobs/{id}/trigger | Manuell ausfuehren                |
| GET    | /jobs/{id}/history | Ausfuehrungshistorie              |
| GET    | /next              | Naechste N geplante Ausfuehrungen |

### Settings (/api/settings)

| Method | Path           | Beschreibung                               |
|--------+----------------+--------------------------------------------|
| GET    | /              | Gesamte settings.yaml als JSON             |
| PATCH  | /states        | States aktualisieren (Reihenfolge, Farben) |
| POST   | /states        | Neuen State hinzufuegen                    |
| DELETE | /states/{name} | State entfernen                            |
| POST   | /tags          | Neuen Tag hinzufuegen                      |
| PATCH  | /tags          | Tags aktualisieren                         |
| PATCH  | /tags/{name}   | Tag aendern (Farbe, Beschreibung)          |
| DELETE | /tags/{name}   | Tag aus Config entfernen                   |

### Dashboard (/api/dashboard)

| Method | Path | Beschreibung                                      |
|--------+------+---------------------------------------------------|
| GET    | /    | Aggregiert: Timer, Budgets, Inbox, Cron, Activity |

### WebSocket (/ws)

Single endpoint. Server sendet JSON Events an alle Clients.

---

## 6. Org-Mode Parser

Kritischste Komponente. Kein General-Purpose-Parser, sondern
zugeschnitten auf die realen Dateiformate.

### 5.1 Data Model (org/models.py)

```python
@dataclass
class OrgFile:
    preamble: list[str]     # #+TITLE, #+STARTUP, Leerzeilen
    headings: list[Heading]

@dataclass
class Heading:
    level: int              # Anzahl * Zeichen
    keyword: str | None     # TODO, DONE, NEXT, IN-PROGRESS,
                            # WAITING, CANCELLED
    title: str              # "[CERMEL] Fix samples"
    tags: list[str]
    properties: dict[str, str]
    logbook: list[Clock]
    body: list[str]         # Restliche Body-Zeilen
    children: list[Heading]
    raw_lines: list[str]    # Originalzeilen fuer Fallback
    dirty: bool = False     # True wenn modifiziert

@dataclass
class Clock:
    start: datetime
    end: datetime | None    # None = laeuft gerade
    duration: str | None    # "4:00" oder None
```

### 5.2 Parser-Strategie

Line-by-Line mit State Machine:

1. Preamble: Alles vor dem ersten Heading
2. Headings: Zeilen die mit ein oder mehr * + Space anfangen
3. Keywords: TODO/NEXT/IN-PROGRESS/WAIT/DONE/CANCELLED
   direkt nach den Sternen
3a. Tags: `:tag1:tag2:` am Zeilenende (vor Newline)
4. Properties: :PROPERTIES: ... :END: Bloecke
5. Logbook: :LOGBOOK: ... :END: mit CLOCK-Zeilen
6. CLOCK-Zeilen (zwei Formate):
   - Geschlossen: CLOCK: [2026-03-30 Mon 20:00]--[2026-03-31 Tue 00:00] =>  4:00
   - Offen: CLOCK: [2026-03-24 Tue 11:59]
7. State-Change-Log: - State "DONE"  from "TODO"  [timestamp]
8. Body: Alles andere unter einem Heading

Bekannte Quirks aus den realen Dateien:
- Inkonsistente Einrueckung von :LOGBOOK: (mal eingerueckt, mal nicht)
- CLOCK-Zeilen manchmal ohne :LOGBOOK: Wrapper (clocks.org Zeile 138)
- Properties koennen nach Body-Text stehen (archive.org)
- Freie Text-Werte in KONTINGENT ("Bestellauftrag 4500800782")

### 5.3 Writer-Strategie

Round-Trip-Garantie:
- Unmodifizierte Headings: raw_lines verbatim ausgeben
- Modifizierte Headings (dirty=True): Aus Feldern rekonstruieren
- parse(file) dann write(ast) muss identisch zum Original sein
  wenn nichts geaendert wurde

Atomare Schreiboperationen:
```python
def write_org_file_atomic(path: Path, content: str):
    tmp = path.with_suffix(".org.tmp")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)
```

### 5.4 Datei-spezifische Parser

todos.org:
- Level-1 = Projekt-Gruppen (CERMEL, LUNG-MV, SENAITE etc.)
- Level-2 = Tasks mit Keywords
- [PROJEKT] Prefix extrahieren via Regex

clocks.org:
- Level-1 = Kundennamen (GROSSBUCHSTABEN)
- Level-2 = Aufgabenbeschreibungen
- CLOCK-Eintraege in Logbooks oder direkt unter Heading
- Offener Timer: CLOCK-Zeile ohne -- Separator

kunden.org:
- Level-1 = Kategorien (Aktive Kunden, Leads, Archiv)
- Level-2 = Kundennamen
- Properties: KONTINGENT, VERBRAUCHT, REST, STATUS, REPO etc.
- Numerische Extraktion: Regex fuer Stunden, Fallback 0

Budget-Berechnung: KONTINGENT aus kunden.org Properties.
VERBRAUCHT ist manuell gepflegt und fungiert als Basis-Offset.
Zeiteintraege (Level-3-Headings im Format "YYYY-MM-DD: Beschreibung"
mit :HOURS: Property) addieren sich zum VERBRAUCHT-Offset.
REST = KONTINGENT - (VERBRAUCHT + Summe Zeiteintraege).
Zeiteintraege werden ueber CLI und API verwaltet:
  oc customer entries <NAME>
  oc customer entry-add / entry-edit / entry-delete
Clock-Eintraege (clocks.org) bleiben davon getrennt und fliessen
erst nach expliziter Buchung ("Book to project") in die
Zeiteintraege ein.

---

## 7. File Watcher

watchfiles.awatch als asyncio Background-Task.

### Watched Paths
- ~/ownCloud/cowork/org/*.org (alle vier org-Dateien)
- ~/ownCloud/cowork/wissen/**/*.md
- ~/ownCloud/cowork/research/**/*.md
- ~/develop/omnicontrol/settings.yaml

### Verhalten
1. Debounce 500ms (Emacs schreibt atomar, ownCloud kann nachtriggern)
2. Datei identifizieren
3. WebSocket Event broadcasten
4. Bei Knowledge-Dateien: FTS Index inkrementell aktualisieren
5. Bei settings.yaml: Config neu laden, settings_changed Event

### Self-Write Erkennung
Set von "expected writes" (Pfad + Timestamp). Beim Schreiben
registrieren, beim Watcher-Event dagegen pruefen. Nach 2s entfernen.
Verhindert Endlos-Loops.

---

## 8. WebSocket Protokoll

### Verbindung
ws://localhost:8000/ws -- kein Auth, Heartbeat alle 30s.

### Nachrichtenformat (Server -> Client)
```json
{
  "type": "file_changed",
  "resource": "kanban",
  "file": "todos.org",
  "timestamp": "2026-03-31T14:30:00Z"
}
```

### Event-Typen

| type             | resource  | Wann                          |
|------------------+-----------+-------------------------------|
| file_changed     | kanban    | todos.org extern geaendert    |
| file_changed     | clocks    | clocks.org geaendert          |
| file_changed     | customers | kunden.org geaendert          |
| file_changed     | inbox     | inbox.org geaendert           |
| file_changed     | knowledge | .md in wissen/ oder research/ |
| cron_started     | cron      | Job gestartet                 |
| cron_finished    | cron      | Job beendet                   |
| clock_tick       | clocks    | Alle 60s bei laufendem Timer  |
| settings_changed | settings  | settings.yaml geaendert       |

### Client -> Server
Keine Befehle ueber WS. Alle Mutationen gehen ueber REST.

---

## 9. Kanban Board

### Spalten-Mapping

Jede Spalte bildet exakt ein org-mode Keyword ab:

| Spalte      | Org Keyword | Beschreibung                     |
|-------------+-------------+----------------------------------|
| TODO        | TODO        | Neue/offene Tasks                |
| NEXT        | NEXT        | Priorisiert, als naechstes dran  |
| IN-PROGRESS | IN-PROGRESS | Aktiv in Bearbeitung             |
| WAIT        | WAIT        | Blockiert, wartet auf Externe    |
| DONE        | DONE        | Erledigt (noch nicht archiviert) |
| CANCELLED   | CANCELLED   | Abgebrochen                      |

DONE und CANCELLED sind collapsed (eingeklappt) per Default.
Archivierung: DONE/CANCELLED Tasks per Klick nach archive.org.

### Drag-Drop
@dnd-kit fuer Drag-Drop zwischen Spalten. Drop triggert PATCH
mit neuem Keyword. Backend schreibt State-Change-Log:
```
- State "IN-PROGRESS"       from "TODO"       [2026-03-31 Tue 23:15]
```

Erlaubte Transitions (alle Richtungen moeglich, keine
kuenstlichen Einschraenkungen -- Ramon weiss was er tut):
```
TODO <-> NEXT <-> IN-PROGRESS <-> DONE
  \       |          |           /
   +------+----WAIT--+----------+
                     |
                 CANCELLED
```

### Tags

Tags werden als farbige Badges auf den Kanban-Karten angezeigt,
aehnlich GitHub Labels. Siehe Section 9a fuer das vollstaendige
Tag-System.

### Kunden-Tags
[KUNDE] Prefix wird als farbiger Tag angezeigt.
Farben fest pro Kunde (Hash des Namens -> HSL Palette).

### Filter und Gruppierung

Das Board unterstuetzt Filter, die kombinierbar sind:
- Nach Kunde: `[CERMEL]`, `[ISC]`, ...
- Nach Tag: `:prio-high:`, `:code:`, `:meeting:`, ...
- Nach Status: einzelne Spalten ein-/ausblenden
- Freitext-Suche im Titel

CLI-Aequivalent:
```bash
oc task list --tag prio-high
oc task list --tag code --customer CERMEL
oc task list --tag @email --status TODO,NEXT
```

---

## 9a. Tag-System und konfigurierbare States

Tags und Task-States sind vollstaendig konfigurierbar --
ueber eine YAML-Datei, die CLI oder die Web-UI.

### Konfigurationsdatei (settings.yaml)

Neben der pydantic-settings Config (Env-Vars/Pfade) gibt es
eine `settings.yaml` fuer Laufzeit-Konfiguration die auch
ueber die Web-UI aenderbar ist:

```yaml
# ~/develop/omnicontrol/settings.yaml

task_states:
  - name: TODO
    label: "Todo"
    color: "#8c8c8a"         # text-muted
    done: false
  - name: NEXT
    label: "Next"
    color: "#D97757"         # accent
    done: false
  - name: IN-PROGRESS
    label: "In Progress"
    color: "#3b82f6"         # blue
    done: false
  - name: WAIT
    label: "Wait"
    color: "#f59e0b"         # amber
    done: false
  - name: DONE
    label: "Done"
    color: "#22c55e"         # green
    done: true
  - name: CANCELLED
    label: "Cancelled"
    color: "#9ca3af"         # gray
    done: true

tags:
  - name: "@email"
    color: "#3b82f6"
    description: "Email-bezogene Aufgabe"
  - name: "@phone"
    color: "#8b5cf6"
    description: "Telefonat/Anruf"
  - name: book
    color: "#f97316"
    description: "SENAITE-Buch bezogen"
  - name: idea
    color: "#a3e635"
    description: "Idee, nicht dringend"
  - name: code
    color: "#06b6d4"
    description: "Programmieraufgabe"
  - name: github
    color: "#171717"
    description: "GitHub-bezogen (PR, Review)"
  - name: issue
    color: "#ef4444"
    description: "Bug/Issue"
  - name: meeting
    color: "#8b5cf6"
    description: "Meeting/Besprechung"
  - name: prio-high
    color: "#dc2626"
    description: "Hohe Prioritaet"
  - name: prio-low
    color: "#9ca3af"
    description: "Niedrige Prioritaet"
  - name: reminder
    color: "#f59e0b"
    description: "Erinnerung/Follow-Up"
  - name: ridingbytes
    color: "#D97757"
    description: "Internes RIDING BYTES"
  - name: senaite
    color: "#22c55e"
    description: "SENAITE Core bezogen"
  - name: youtube
    color: "#ef4444"
    description: "YouTube-Content"
```

Die `settings.yaml` liegt im Projektverzeichnis und wird
per File Watcher beobachtet -- Aenderungen (via Editor oder
Web-UI) werden sofort aktiv.

### Konfigurationsprinzip

```
settings.yaml    <-->    Web-UI Settings Page
      |                         |
      v                         v
  Config Service (services/settings.py)
      |
      +-- Parser: kennt gueltige Keywords
      +-- Writer: kennt gueltige Keywords
      +-- Kanban: baut Spalten dynamisch
      +-- CLI: validiert --status / --tag Werte
      +-- Frontend: rendert Spalten + Tag-Farben
```

Aenderungen in der Web-UI schreiben in settings.yaml.
Aenderungen in settings.yaml (mit Editor) werden per
File Watcher erkannt und ans Frontend gepusht.

### States konfigurieren

**Via CLI:**
```bash
# States auflisten
oc config states

# State hinzufuegen
oc config add-state REVIEW --label "Review" \
    --color "#a855f7" --after IN-PROGRESS

# State entfernen (nur wenn keine Tasks diesen Status haben)
oc config remove-state REVIEW

# State-Reihenfolge aendern
oc config move-state WAIT --after NEXT
```

**Via Web-UI (Settings Page):**
- Drag-Drop Reihenfolge der Spalten
- Name, Label, Farbe editierbar
- Toggle "Done-State" (collapsed/archivierbar)
- Neuen State hinzufuegen / entfernen
- Live-Preview: Kanban Board aktualisiert sofort

**Validierung:**
- Mindestens ein Non-Done State muss existieren
- Mindestens ein Done State muss existieren
- State-Namen muessen org-mode kompatibel sein
  (Grossbuchstaben, Bindestriche erlaubt)
- Entfernen nur moeglich wenn kein Task den State nutzt

### Org-Mode Tags

Org-mode Tags stehen am Zeilenende eines Headings:
```org
** TODO [CERMEL] Geister-Samples loeschen    :issue:prio-high:
** NEXT [ISC] Meeting vorbereiten             :meeting:
** TODO [SENAITE] AT->DX Migration            :code:senaite:
```

Tags werden mit Doppelpunkten getrennt, beginnen und enden
mit Doppelpunkt. Das ist Standard-org-mode und funktioniert
in Emacs (C-c C-c zum Taggen) und in OmniControl gleich.

### Tags konfigurieren

**Via CLI:**
```bash
# Bekannte Tags auflisten (konfigurierte + aus org-Dateien)
oc tag list

# Tag zur Konfiguration hinzufuegen
oc tag add deployment --color "#10b981" \
    --description "Deployment-bezogen"

# Tag-Farbe aendern
oc tag update code --color "#0ea5e9"

# Tag aus Konfiguration entfernen
# (loescht nicht aus org-Dateien, nur aus Vorschlagsliste)
oc tag remove deployment
```

**Via Web-UI (Settings Page):**
- Tag-Liste mit Farbe, Beschreibung, Anzahl Tasks
- Inline-Edit: Name, Farbe (Color-Picker), Beschreibung
- Neuen Tag hinzufuegen
- Drag-Drop Reihenfolge (bestimmt Autocomplete-Sortierung)
- Tag loeschen (nur aus Config, nicht aus org-Dateien)

### Freie Tags + Autocomplete

Tags sind nicht auf die konfigurierte Liste beschraenkt.
Jeder beliebige String ist ein gueltiger Tag:
```bash
oc task add CERMEL "Update planen" --tag deployment
oc task add ISC "Review" --tag sprint-review --tag prio-high
```

Autocomplete-Reihenfolge:
1. Konfigurierte Tags (settings.yaml, mit Farbe + Beschreibung)
2. Tags aus todos.org (noch nicht konfiguriert)
3. Tags aus archive.org (historisch)

Nicht-konfigurierte Tags bekommen eine automatische Farbe
(Hash des Namens -> HSL). Ueber die Web-UI oder CLI kann
man ihnen nachtraeglich Farbe + Beschreibung geben.

```bash
oc task add CERMEL "..." --tag pri<TAB>
# -> prio-high, prio-low
oc task add CERMEL "..." --tag dep<TAB>
# -> deployment (wenn zuvor verwendet)
```

### Tag-Verwaltung

```bash
# Tags eines Tasks aendern
oc task tag <id> code issue          # Tags setzen
oc task tag <id> +prio-high          # Tag hinzufuegen
oc task tag <id> -prio-low           # Tag entfernen

# Tasks nach Tag filtern
oc task list --tag prio-high
oc task list --tag code --tag senaite  # AND
oc task list --tag "code|meeting"      # OR
```

Ausgabe `oc tag list`:
```
Tag           Color    Tasks  Beschreibung
@email        #3b82f6    3   Email-bezogene Aufgabe
@phone        #8b5cf6    1   Telefonat/Anruf
code          #06b6d4   12   Programmieraufgabe
github        #171717    5   GitHub-bezogen (PR, Review)
issue         #ef4444    8   Bug/Issue
meeting       #8b5cf6    2   Meeting/Besprechung
prio-high     #dc2626    4   Hohe Prioritaet
prio-low      #9ca3af    6   Niedrige Prioritaet
senaite       #22c55e    7   SENAITE Core bezogen
deployment*   #48c78e    1   (nicht konfiguriert)
```

`*` markiert Tags die in org-Dateien existieren aber nicht
in settings.yaml konfiguriert sind.

### API Endpoints (/api/settings)

| Method | Path                    | Beschreibung                   |
|--------+-------------------------+--------------------------------|
| GET    | /settings               | Gesamte settings.yaml als JSON |
| PATCH  | /settings/states        | States aktualisieren           |
| PATCH  | /settings/tags          | Tags aktualisieren             |
| POST   | /settings/states        | State hinzufuegen              |
| DELETE | /settings/states/{name} | State entfernen                |
| POST   | /settings/tags          | Tag hinzufuegen                |
| PATCH  | /settings/tags/{name}   | Tag aendern                    |
| DELETE | /settings/tags/{name}   | Tag entfernen                  |

### Parser (org/models.py)

Tags werden aus der Heading-Zeile extrahiert:
```python
# Heading Format:
# ** TODO [CERMEL] Beschreibung    :tag1:tag2:tag3:
TAG_PATTERN = re.compile(
    r"\s+(:[a-zA-Z0-9_@-]+(?::[a-zA-Z0-9_@-]+)*:)\s*$"
)
```

Keywords werden gegen `config.task_states` validiert
statt gegen eine hardcoded Liste.

### Writer

Beim Schreiben wird die Tag-Liste an das Zeilenende
angehaengt:
```python
def format_heading_line(heading: Heading) -> str:
    line = f"{'*' * heading.level} "
    if heading.keyword:
        line += f"{heading.keyword} "
    line += heading.title
    if heading.tags:
        tag_str = ":" + ":".join(heading.tags) + ":"
        line += f"  {tag_str}"
    return line
```

### Frontend: Tag-Badges

Tags werden als farbige Badges dargestellt:
- Farbe aus settings.yaml (konfiguriert) oder Hash-Fallback
- `@`-Prefix Tags (Kontext): Icon-Prefix
- Klick auf Tag: filtert Board nach diesem Tag
- Tag-Dropdown im Task-Editor mit Autocomplete
- Settings Page fuer Tag-/State-Verwaltung

### Frontend: Settings Page

Erreichbar ueber Sidebar-Icon (Zahnrad) oder Tastenkuerzel.

Zwei Tabs:

**Task States:**
- Sortierbare Liste aller States (Drag-Drop)
- Pro State: Name, Label, Farbe (Color-Picker), Done-Toggle
- "State hinzufuegen" Button
- Entfernen nur wenn keine Tasks den State nutzen
- Live-Preview: Kanban Spalten aendern sich sofort

**Tags:**
- Sortierbare Liste aller konfigurierten Tags
- Pro Tag: Name, Farbe (Color-Picker), Beschreibung
- "Tag hinzufuegen" Button
- Nicht-konfigurierte Tags (aus org-Dateien) als
  graue Eintraege mit "Konfigurieren" Button
- Tag-Count (Anzahl Tasks die diesen Tag verwenden)

### Emacs-Kompatibilitaet

Tags und States in OmniControl und Emacs sind unabhaengig
konfiguriert. Die org-Dateien sind die gemeinsame Wahrheit:

- Neue Tags in Emacs (C-c C-c) erscheinen automatisch in
  OmniControl (als unkonfigurierte Tags mit Hash-Farbe)
- Neue Tags in OmniControl erscheinen in Emacs beim
  naechsten Oeffnen der Datei
- Neue States in OmniControl erscheinen als Keywords in
  org-Dateien, Emacs erkennt sie automatisch
- Kein Sync der Definitionen noetig
- Empfehlung: org-tag-alist in config.el und settings.yaml
  manuell synchron halten (optional, nicht erzwungen)

---

## 10. Time Tracking

### Aktiver Timer
Backend prueft clocks.org nach offenen CLOCK-Zeilen (Start ohne
Ende). Frontend zeigt laufende Uhr mit Elapsed Time. WebSocket
clock_tick Event alle 60s fuer Update.

### Quick-Book
Texteingabe: "2h CERMEL Email" oder "30min ISC Meeting"

Parser-Pattern: Dauer (h/min) + Kundenname + Beschreibung

Backend berechnet Start/Ende (Ende = jetzt, Start = jetzt - Dauer)
und schreibt CLOCK-Eintrag unter dem passenden Kunden-Heading.

### Budget-Uebersicht
Kunden mit Farbcodierung:
- Gruen (>50% Rest)
- Gelb (25-50%)
- Rot (<25%)
- Grau (inaktiv/0 Kontingent)

---

## 11. Inbox

### Auto-Kategorisierung
Wenn Text eingegeben wird (Email, Idee, Notiz):

1. Typ erkennen (Keyword-Matching):
   - "email", "von:", "from:", "betreff" -> EMAIL
   - "idee", "idea", "vielleicht" -> IDEE
   - "lead", "anfrage", "interessent" -> LEAD
   - Default: NOTIZ
2. Kunden erkennen: Kundennamen aus kunden.org gegen Text matchen
3. Eintrag schreiben in inbox.org:

```org
* EMAIL [LUNG-MV] Rueckmeldung Dr. Klonus
  :PROPERTIES:
  :CREATED: [2026-04-01 Tue 14:30]
  :FROM: Dr. Sascha Klonus
  :TYPE: email
  :FOLLOW_UP: [2026-04-04 Fri]
  :ATTACHMENTS: kunden/lung-mv/2026-04-01_klonus_angebot.pdf
  :END:
  Klonus schickt ueberarbeitetes Angebot fuer SHAPTH.
  Aenderungen gegenueber letzter Version: ...
  Vorgeschlagene Aktion: Angebot pruefen, bis Fr antworten.
```

### Follow-Up Tracking

FOLLOW_UP Property setzt ein Erinnerungsdatum. Der Advisor
und das Briefing pruefen WAITING Tasks und Inbox-Items mit
FOLLOW_UP:
- Vor dem Datum: "Klonus: Follow-Up am Freitag"
- Am Datum: "HEUTE: Klonus nachfassen!"
- Ueberfaellig: "Klonus seit 3 Tagen ueberfaellig (rot)"

### Attachment-Handling

Wenn Claude Code (cowork) eine Email mit Anhaengen verarbeitet:

1. **Dateien erkennen**: PDFs, Bilder, Excel, CSV im Terminal
2. **Ablage**: `~/ownCloud/cowork/kunden/{kunde}/{datum}_{betreff}.{ext}`
3. **Zusammenfassung**: `.md` Datei neben dem Attachment
4. **Referenz**: :ATTACHMENTS: Property im Inbox-Eintrag
   (relative Pfade zu kunden/)

Verzeichniskonvention:
```
~/ownCloud/cowork/kunden/
  lung-mv/
    2026-04-01_klonus_angebot.pdf
    2026-04-01_klonus_angebot.md     # KI-Zusammenfassung
  cermel/
    2026-03-28_update_anfrage.pdf
  isc/
    2026-03-27_rechnung_pos4.xlsx
```

Attachments werden NICHT in SQLite gespeichert, nur referenziert.
Die Dateien liegen in ownCloud und sind so auch auf iPad/Emacs
verfuegbar.

### Antwortvorschlag

Bei Emails generiert Claude Code direkt einen Antwortvorschlag:
```
--- Antwortvorschlag ---
Sehr geehrter Dr. Klonus,

vielen Dank fuer das ueberarbeitete Angebot. Ich werde
die Aenderungen pruefen und melde mich bis Freitag.

Mit freundlichen Gruessen,
Ramon Bartl
---
Soll ich daraus einen WAITING Task machen? [j/n]
```

Das passiert in Claude Code (cowork), nicht in OmniControl.
OmniControl speichert nur das Ergebnis (Inbox + Task + Comm).

---

## 12. Communications (SQLite)

Verifizierbare Kommunikationshistorie. Verhindert, dass Claude
sich an Dinge "erinnert" die nie passiert sind.

### Prinzip: Nachschlagen statt Erinnern

```
Claude fragt: "Was hat Klonus zuletzt geschrieben?"

  FALSCH: Aus dem LLM-Gedaechtnis antworten (halluziniert)
  RICHTIG: SELECT * FROM communications
           WHERE customer = 'LUNG-MV'
           ORDER BY date DESC LIMIT 5
```

### Datenbank (data/omnicontrol.db)

Eine einzige SQLite-Datei fuer alle strukturierten Daten:

```sql
-- Kommunikationshistorie
CREATE TABLE communications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL,         -- email, call, meeting, note
    subject TEXT NOT NULL,
    from_contact TEXT,          -- "Dr. Sascha Klonus"
    summary TEXT,               -- KI-generierte Zusammenfassung
    reply_draft TEXT,           -- Antwortvorschlag (optional)
    attachment_paths TEXT,      -- JSON: ["kunden/lung-mv/..."]
    follow_up_date TEXT,        -- "2026-04-04"
    org_ref TEXT,               -- Verweis auf inbox.org Heading
    created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE comm_fts USING fts5(
    customer, subject, summary, from_contact,
    content=communications,
    tokenize='unicode61 remove_diacritics 2'
);

-- Knowledge Base (bereits geplant, jetzt in gleicher DB)
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
    path, title, content, source,
    tokenize='unicode61 remove_diacritics 2'
);

-- Cron History (bereits geplant, jetzt in gleicher DB)
CREATE TABLE cron_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    duration_seconds REAL,
    output_path TEXT,
    error TEXT,
    model TEXT
);
```

### Wann wird geschrieben

| Aktion                 | Was passiert                                |
|------------------------+---------------------------------------------|
| Email reinpaste        | Comm-Eintrag + Inbox-Eintrag + Attachments  |
| `oc comm add`          | Manueller Comm-Eintrag (Telefonat, Meeting) |
| Cron "Follow-Up Check" | Prueft ueberfaellige FOLLOW_UP Daten        |

### Speicher-Abgrenzung

| Speicher  | Was                               | Warum                       |
|-----------+-----------------------------------+-----------------------------|
| MEMORY.md | Wer Ramon ist, Praeferenzen       | Stabil, Claude-Kontext      |
| Org-Files | Tasks, Clocks, Inbox, Kunden      | Source of Truth, Emacs      |
| SQLite    | Comm-History, Knowledge FTS, Cron | Durchsuchbar, verifizierbar |
| kunden/   | Attachments, Dokumente            | Dateien, ownCloud Sync      |

MEMORY.md bleibt klein (<200 Zeilen). Alles Faktische was wachsen
kann geht in SQLite. Claude fragt die DB ab statt zu raten.

### CLI (`oc comm`)

```bash
# Kommunikation auflisten
oc comm list LUNG-MV              # Alle Eintraege
oc comm list LUNG-MV --type email # Nur Emails
oc comm list --recent              # Letzte 10 ueber alle Kunden

# Volltextsuche
oc comm search "Angebot Klonus"
oc comm search "SHAPTH" --customer LUNG-MV

# Detail anzeigen (mit Attachment-Links)
oc comm show 42

# Manuell eintragen (Telefonat, Meeting)
oc comm add LUNG-MV --type call "Telefonat mit Dr. Klonus"
oc comm add ISC --type meeting "Sprint Review"
```

Ausgabe `oc comm list LUNG-MV`:
```
#42  2026-04-01  email    Dr. Klonus    Angebot SHAPTH
#38  2026-03-19  email    Dr. Klonus    Erste Anfrage
#35  2026-03-10  call     Dr. Klonus    Telefonat Einfuehrung
```

### API Endpoints (/api/communications)

| Method | Path        | Beschreibung                                       |
|--------+-------------+----------------------------------------------------|
| GET    | /           | Alle Eintraege, Filter: ?customer=&type=&from=&to= |
| GET    | /{id}       | Einzelner Eintrag mit Attachments                  |
| POST   | /           | Neuen Eintrag anlegen                              |
| GET    | /search     | ?q=... Volltextsuche                               |
| GET    | /follow-ups | Ueberfaellige + anstehende Follow-Ups              |

### Frontend

- CommHistory: Chronologische Liste pro Kunde
- CommSearch: Globale Suche ueber alle Kommunikation
- AttachmentList: Dateiliste mit Download-Links
- Follow-Up Widget im Dashboard (Badge mit Anzahl ueberfaelliger)

### Advisor-Integration

Der AI Advisor hat Zugriff auf die Communications DB:
```python
def build_advisor_context() -> str:
    # ... bestehender Kontext ...
    recent_comms = comm_service.list_recent(limit=10)
    follow_ups = comm_service.get_overdue_follow_ups()
    return format_context(..., recent_comms, follow_ups)
```

Damit kann der Advisor sagen:
"Klonus hat am 1. April das Angebot geschickt, Follow-Up
war fuer Freitag geplant -- heute ist Dienstag, willst du
nachfassen?" -- basierend auf DB-Fakten, nicht Halluzination.

---

## 13. Knowledge Base

### Indexing
SQLite FTS5 in data/omnicontrol.db (gleiche DB wie Communications):

```sql
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
    path,
    title,
    content,
    source,
    tokenize='unicode61 remove_diacritics 2'
);
```

- Startup: Vollstaendiger Index (~1MB Markdown, unter 1 Sekunde)
- Datei-Aenderung: Einzelne Datei neu indexieren
- Loeschung: Aus Index entfernen
- .obsidian/ Verzeichnis ausschliessen

### Suche
FTS5 MATCH mit highlight() fuer Snippet-Extraktion.
Top 20 Ergebnisse nach Relevanz sortiert.

### Obsidian-Kompatibilitaet
- Dateien werden NIE vom Knowledge-Feature modifiziert
- Index ist read-only
- Kein proprietaeres Metadata
- .obsidian/ Config bleibt unberuehrt
- Standard Markdown, kein Frontmatter

### Frontend
Split-Pane Layout:
- Links: Verzeichnisbaum (collapsible)
- Rechts: Markdown-Viewer (react-markdown)
- Oben: Suchleiste
- Suchergebnisse: Dateiname, Matching-Zeile, Kontext-Snippet

---

## 14. Cron Job Manager

### Job-Definitionen (jobs.yaml)

```yaml
jobs:
  - id: daily-briefing
    name: "Daily Briefing"
    schedule: "30 9 * * 1-5"       # Mo-Fr 09:30
    model: "ollama:qwen3:14b"
    prompt_file: "prompts/daily-briefing.md"
    output: "~/ownCloud/cowork/research/daily-briefing-{date}.md"
    timeout: 120
    enabled: true

  - id: weekly-scout
    name: "Business Scout"
    schedule: "0 9 * * 1"          # Montag 09:00
    model: "ollama:llama3.3:70b"
    prompt_file: "prompts/weekly-scout.md"
    output: "~/ownCloud/cowork/research/scout_ideas_{date}.md"
    timeout: 300
    enabled: true

  - id: weekly-project-update
    name: "Project Status"
    schedule: "0 17 * * 5"         # Freitag 17:00
    model: "ollama:qwen3:14b"
    prompt_file: "prompts/project-update.md"
    output: "inbox"                # Schreibt nach inbox.org
    timeout: 120
    enabled: true
```

Model-Format: ollama:model_name oder claude:model_name

### Scheduler
APScheduler AsyncScheduler mit CronTrigger. Startet im
FastAPI Lifespan. Jobs werden dynamisch aktualisiert wenn die
API sie aendert.

### Executor (cron/executor.py)

Zwei Ausfuehrungspfade:

Ollama: HTTP POST an Ollama generate API
```python
async def execute_ollama(model, prompt, timeout):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json={"model": model, "prompt": prompt,
                  "stream": False},
            timeout=timeout,
        )
        return response.json()["response"]
```

Claude: Subprocess-Aufruf der Claude CLI
```python
async def execute_claude(model, prompt, timeout):
    proc = await asyncio.create_subprocess_exec(
        "claude", "-p", prompt, "--model", model,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(), timeout=timeout
    )
    return stdout.decode()
```

Kein API-Key noetig -- Claude CLI uebernimmt Auth.

### Prompt-Templates
Variable Substitution: {date}, {customer_list},
{open_tasks}, {recent_clocks}.
Migrierte Prompts aus bruce/sub-agents/.

### Ausfuehrungshistorie (SQLite)
```sql
CREATE TABLE cron_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    duration_seconds REAL,
    output_path TEXT,
    error TEXT,
    model TEXT
);
```

### Fehlerbehandlung
- Timeout: Prozess/Request abbrechen, als "timeout" loggen
- Ollama nicht erreichbar: "connection_error", 1x Retry nach 30s
- Claude CLI Fehler: stderr loggen, als "failed" markieren
- Nie den Scheduler crashen: Fehler loggen und weitermachen
- max_instances=1 pro Job verhindert Ueberlappung

### Frontend
- JobList: Uebersicht aller Jobs mit Status (aktiv/inaktiv)
- JobEditor: Formular (Cron-Ausdruck, Model-Picker, Prompt-Editor)
- ExecutionHistory: Tabelle mit Zeitstempel, Status, Dauer, Output
- Manueller Trigger-Button pro Job

---

## 15. Dashboard (Startseite)

Widget-Layout mit:
- Aktiver Timer: Laufende Uhr (wenn Timer aktiv)
- Budget-Meter: Farbige Balken pro aktivem Kunden
- Offene Tasks: Anzahl TODO + NEXT + IN-PROGRESS
- GitHub: Issue-Counts pro Kunde, offene PRs
- Inbox: Unbearbeitete Eintraege (Badge)
- Follow-Ups: Ueberfaellige + anstehende (Badge rot/gelb)
- Naechste Cron Jobs: Was laeuft als naechstes
- Activity Feed: Letzte Aenderungen (Zeitbuchungen, Tasks)
- AI Advisor: Chat-Icon oeffnet Slide-Over Panel

---

## 16. GitHub Integration

### Voraussetzung
`gh` CLI installiert und authentifiziert (`gh auth status`).
Keine eigene GitHub API Authentifizierung noetig.

### Repo-Mapping (kunden.org)
Jeder Kunde hat eine optionale :REPO: Property:
```org
** CERMEL
:PROPERTIES:
:REPO: ridingbytes/cermel.lims
:END:
```

Der GitHub Service liest dieses Mapping aus kunden.org.
Kunden ohne :REPO: werden bei GitHub-Operationen uebersprungen.

### Service (services/github.py)

```python
def list_issues(repo: str, state: str = "open") -> list:
    """gh issue list --repo {repo} --state {state} --json"""
    result = subprocess.run(
        ["gh", "issue", "list",
         "--repo", repo,
         "--state", state,
         "--json", "number,title,state,createdAt,labels,"
                   "assignees,updatedAt"],
        capture_output=True, text=True,
    )
    return json.loads(result.stdout)

def list_prs(repo: str, state: str = "open") -> list:
    """gh pr list --repo {repo} --json"""
    ...

def get_issue(repo: str, number: int) -> dict:
    """gh issue view {number} --repo {repo} --json"""
    ...
```

Alle Aufrufe nutzen `gh ... --json` fuer strukturierte Ausgabe.
Kein REST/GraphQL direkt -- gh CLI abstrahiert Auth und Pagination.

### Issue-Referenzen in Tasks und Clocks

Tasks und Clock-Eintraege koennen Issues referenzieren:
```org
** TODO [CERMEL] Fix #42 Geister-Samples
```

Das `#42` Pattern wird erkannt und mit dem Kunden-Repo verlinkt.
Im Frontend wird `#42` als klickbarer Link dargestellt.

Bei `oc clock book 2h CERMEL "#42 Debugging"` wird die Issue-Nummer
in der Aufgabenbeschreibung gespeichert. Die Clock-Summary kann
dann Stunden pro Issue aggregieren.

### Autocomplete

Click Shell Completion fuer Issue-Nummern:
1. Beim ersten `oc gh issues KUNDE` werden Issues gecacht
   (JSON in data/gh_cache/{repo}.json, TTL 5min)
2. Tab-Completion liest aus dem Cache
3. Kundennamen-Completion liest direkt aus kunden.org

```bash
oc gh issues CER<TAB>          # -> CERMEL
oc clock book 2h CERMEL "#<TAB>"  # -> #42, #38, #35
oc task add CERMEL "#<TAB>"       # -> Issue-Titel als Vorschlag
```

### API Endpoints (/api/github)

| Method | Path                        | Beschreibung                             |
|--------+-----------------------------+------------------------------------------|
| GET    | /issues                     | Issues, Filter: ?customer=&state=        |
| GET    | /issues/{customer}/{number} | Einzelnes Issue                          |
| GET    | /prs                        | Pull Requests, Filter: ?customer=&state= |
| GET    | /summary                    | Issue-Counts pro Kunde                   |

### Frontend

- IssueList: Tabelle mit Issue-Nummer, Titel, Labels, Alter
- IssueBadge: Klickbarer `#42` Badge in Tasks und Clocks
- RepoSelector: Dropdown fuer Kunden-Repo Filter
- GitHubWidget: Issue-Counts + PRs auf dem Dashboard

---

## 17. AI Advisor (optional, lightweight)

Leichtgewichtiger KI-Assistent im Dashboard fuer schnelle
Fragen wenn man gerade nicht im Terminal ist. Laeuft auf
Ollama (lokal, kostenlos). Kein Ersatz fuer Claude Code
(cowork) im Terminal.

### Abgrenzung: Terminal vs. App-Chat

|                               | Terminal (cowork)       | App-Chat (Advisor)       |
|-------------------------------+-------------------------+--------------------------|
| **Modell**                    | Claude Opus (voll)      | Ollama lokal (kostenlos) |
| **Emails reinpasten**         | Ja                      | Nein                     |
| **Attachments lesen**         | Ja (PDF, Bilder, Excel) | Nein                     |
| **Antwortvorschlaege**        | Ja (Opus-Qualitaet)     | Nein                     |
| **Code editieren**            | Ja                      | Nein                     |
| **Komplexe Recherche**        | Ja                      | Nein                     |
| **Tasks anlegen/verschieben** | Ja                      | Ja (via oc-Commands)     |
| **"Was steht heute an?"**     | Ja (ausfuehrlich)       | Ja (Quick-Check)         |
| **Budget/Stunden-Fragen**     | Ja                      | Ja                       |
| **GitHub Issues abfragen**    | Ja                      | Ja                       |
| **Verfuegbar ohne Terminal**  | Nein                    | Ja (Browser)             |
| **Kosten**                    | API-Kosten              | Kostenlos (Ollama)       |

Faustregel: Alles was Analyse, Dateizugriff oder Qualitaet
braucht -> Terminal. Alles was schnelle Daten-Abfrage ist
-> App-Chat oder direkt das Dashboard.

### Architektur

```
User  -->  oc ask "..."  -->  Advisor Service
                                |
                          Context aus DB/org:
                          - Tasks, Clocks, Budgets
                          - GitHub Issues (gecacht)
                          - Communications (SQLite)
                          - Follow-Ups
                                |
                          Prompt + Context --> Ollama
                                |
                          Antwort + oc-Command Vorschlaege
                                |
                          User bestaetigt  --> oc ausfuehren
```

### Kontext-Sammlung (services/advisor.py)

```python
def build_advisor_context() -> str:
    """Sammelt strukturierten Arbeitskontext."""
    tasks = kanban_service.list_tasks(
        status=["TODO", "NEXT", "IN-PROGRESS"])
    active_timer = clock_service.get_active()
    budgets = customer_service.get_summaries()
    inbox = inbox_service.list_items()
    issues = github_service.list_all_customer_issues()
    recent_clocks = clock_service.list_entries(period="week")
    follow_ups = comm_service.get_overdue_follow_ups()
    return format_context(tasks, active_timer, budgets,
                          inbox, issues, recent_clocks,
                          follow_ups)
```

Nur strukturierte Daten, keine Dateien. Deshalb reicht ein
lokales Ollama-Modell.

### Tool-Use: CLI als Werkzeug

Der Advisor kann `oc` Commands vorschlagen UND ausfuehren.
Zwei Modi:

**Interaktiv (CLI):** Advisor schlaegt Aktionen vor, User
bestaetigt einzeln oder alle:
```
Advisor: Soll ich folgendes anlegen?
  1. oc task add CERMEL "Fix #42 Geister-Samples" --status NEXT
  2. oc task add ISC "Rechnung vorbereiten" --status NEXT
  3. oc clock book 30min RIDINGBYTES "Tagesplanung"
> [1,2,3/alle/nein]
```

**Automatisch (Cron):** Bei Cron Jobs (z.B. Daily Briefing)
kann der Advisor direkt handeln wenn in der Job-Config
`auto_execute: true` gesetzt ist:
```yaml
- id: daily-triage
  name: "Issue Triage"
  schedule: "0 8 * * 1-5"
  model: "ollama:qwen3:14b"
  prompt_file: "prompts/daily-triage.md"
  auto_execute: true       # Advisor darf oc commands ausfuehren
  allowed_commands:         # Whitelist
    - "task add"
    - "task move"
    - "inbox add"
```

### Prompt-Struktur

```markdown
Du bist der OmniControl Advisor fuer Ramon Bartl (RIDING BYTES).
Du bist ein leichtgewichtiger Quick-Check Assistent.
Fuer komplexe Aufgaben verweise auf das Terminal (cowork).

## Aktueller Kontext
{context}

## Verfuegbare Aktionen
Du kannst folgende oc-Commands vorschlagen:
- oc task add <kunde> "<beschreibung>" [--status NEXT]
- oc task move <id> <status>
- oc clock book <dauer> <kunde> "<beschreibung>"
- oc inbox add "<text>"

## Aufgabe
{user_question}

Antworte kurz und strukturiert:
1. Fakten (aus Kontext, nicht raten)
2. Empfehlung
3. oc-Commands (falls noetig)
```

### API Endpoints (/api/advisor)

| Method | Path     | Beschreibung                         |
|--------+----------+--------------------------------------|
| POST   | /ask     | Frage stellen, Antwort + Vorschlaege |
| POST   | /execute | Vorgeschlagene Commands ausfuehren   |

### Frontend: Chat Panel

Slide-Over Panel (rechts), erreichbar ueber Chat-Icon oder
Tastenkuerzel `a`. Features:
- Chat-Interface mit Markdown-Rendering
- Vorgeschlagene Commands als klickbare Buttons
- "Alle ausfuehren" Button fuer Batch-Execution
- Aenderungen erscheinen sofort im Dashboard/Kanban
  (via WebSocket file_changed Events nach CLI-Ausfuehrung)
- Model-Picker (Ollama Modelle)
- Hinweis "Fuer Emails/Attachments -> Terminal (cowork)"

### Echtzeit-Feedback-Loop

```
User klickt "Alle ausfuehren" im Chat Panel
  --> Frontend POST /api/advisor/execute
  --> Backend fuehrt oc-Commands aus (subprocess)
  --> org-Dateien werden geschrieben
  --> File Watcher erkennt Aenderung
  --> WebSocket: file_changed Events
  --> Frontend aktualisiert Kanban/Clocks/Dashboard
```

Der User sieht die Aenderungen innerhalb von ~1s in allen
offenen Views -- ohne Page Reload.

---

## 18. Concurrency und Edge Cases

### Gleichzeitige Bearbeitung (Emacs + Web App)

Optimistic Concurrency ohne Locking:
1. Datei lesen, Hash berechnen
2. Modifikation anwenden
3. Vor dem Schreiben: Datei nochmal lesen, Hash pruefen
4. Wenn Hash abweicht: Datei neu lesen, Modifikation erneut
   anwenden, nochmal schreiben
5. Wenn nach Retry immer noch abweichend: HTTP 409 Conflict
6. Frontend bei 409: "Datei wurde extern geaendert. Bitte
   nochmal versuchen."

Bei einem einzelnen Benutzer sind Konflikte extrem selten.

### Org-Mode Formatting
- Parser akzeptiert beide Einrueckungsvarianten
- Writer nutzt raw_lines fuer unmodifizierte Headings
- CLOCK ohne LOGBOOK-Wrapper wird korrekt erkannt
- State-Change-Log wird beim Statuswechsel geschrieben
- BEGIN_SRC / END_SRC Bloecke werden verbatim erhalten

---

## 19. Design / Farbschema

Warme Palette aus dem bestehenden Dashboard:
```css
--bg-primary: #faf9f5;
--bg-secondary: #F5F4EF;
--bg-card: #ffffff;
--text-primary: #141413;
--text-secondary: #5c5c5a;
--text-muted: #8c8c8a;
--accent: #D97757;
--accent-hover: #c4684a;
--border: #e5e4df;
```

Font: Inter. Sidebar links, Content rechts.

---

## 20. Implementierungsreihenfolge

Dokumentation ist kein separater Schritt sondern Teil jeder
Phase. Jede Phase die Commands oder Endpoints aendert MUSS
die zugehoerigen docs/ aktualisieren (Definition of Done).

### Phase 1: Foundation (Prio 1)
1. Projektstruktur anlegen, pyproject.toml, Dependencies
2. pydantic-settings Config (alle Pfade konfigurierbar)
3. SQLite Setup (omnicontrol.db: Communications, FTS, Cron)
4. Org-Mode Parser + Writer (todos.org, clocks.org Format)
5. Round-Trip Tests gegen Kopien der echten org-Dateien
6. Kunden Parser mit Budget-Extraktion
7. Inbox Parser mit Attachment-Handling + FOLLOW_UP
8. docs/: quickstart.md, installation.md, contributing.md,
   architecture.md, reference/config.md, reference/org-format.md

### Phase 2: CLI -- `oc` (Prio 1)
1. Click CLI Skeleton mit Entry Point `oc`
2. `oc task` -- Tasks aus todos.org (add/list/move/done)
3. `oc clock` -- Zeitbuchung (book/start/stop/status/list)
4. `oc customer` -- Kundenregister (list/show/summary)
5. `oc inbox` -- Inbox (add/list/promote, Pipe-Support)
6. `oc comm` -- Kommunikationshistorie (list/search/add)
7. `oc kb` -- Knowledge Base Suche (search/list/show)
8. `oc briefing` -- Morgen-Briefing (inkl. Follow-Ups)
9. Tests fuer alle CLI Commands
10. docs/cli/*.md fuer jeden Command (Syntax, Flags, Beispiele)
11. docs/guides/time-tracking.md, email-workflow.md

### Phase 3: GitHub Integration (Prio 1)
1. GitHub Service (gh CLI Wrapper, JSON-Parsing)
2. `oc gh` -- Issues/PRs auflisten, oeffnen
3. Issue-Referenzen (#42) in Tasks und Clocks
4. Tab-Completion fuer Kunden + Issue-Nummern
5. Issue-Cache (data/gh_cache/, TTL 5min)
6. Briefing erweitern: GitHub Issue-Counts
7. docs/cli/gh.md, docs/guides/github-integration.md

### Phase 4: AI Advisor (Prio 2)
1. Advisor Service (Kontext-Sammlung inkl. Comm-DB)
2. `oc ask` -- Interaktiver KI-Advisor
3. Command-Vorschlaege + User-Bestaetigung
4. Command-Execution (Advisor fuehrt oc-Commands aus)
5. Cron-Integration (auto_execute + allowed_commands)
6. docs/cli/ask.md

### Phase 5: FastAPI Layer (Prio 2)
1. FastAPI Skeleton mit Health-Endpoint
2. Alle Router (Kanban, Clocks, Customers, Inbox,
   Communications, Knowledge, Cron, GitHub, Advisor,
   Dashboard)
3. Duenner Layer ueber die gleichen Services
4. docs/reference/api.md (alle Endpoints)

### Phase 6: File Watcher + WebSocket (Prio 2)
1. watchfiles Watcher mit Self-Write Erkennung
2. WebSocket Manager mit Connection Pool
3. Integration Test: Emacs Edit -> WebSocket Event
4. docs/reference/websocket.md

### Phase 7: Cron Job Manager (Prio 2)
1. jobs.yaml Schema + YAML Read/Write
2. APScheduler Integration
3. Ollama Executor + Claude CLI Executor
4. Ausfuehrungshistorie (SQLite)
5. Prompt-Templates migrieren
6. Follow-Up Reminder Cron Job
7. docs/guides/cron-jobs.md, docs/cli/cron.md

### Phase 8: React Frontend (Prio 3)
1. Vite + React + Router + Tailwind + Sidebar
2. Kanban Board mit @dnd-kit Drag-Drop
3. ClocksPage + ActiveTimer + QuickBook
4. CustomersPage mit BudgetMeter
5. InboxPage mit CaptureForm + AttachmentList
6. CommHistory + CommSearch
7. KnowledgePage mit Split-Pane + Suche
8. CronPage mit JobList + History
9. GitHub IssueList + IssueBadge
10. AI Advisor Chat Panel (Slide-Over)
11. DashboardPage mit Widgets + GitHubWidget
    + Follow-Up Badge
12. WebSocket Hook mit Auto-Reconnect

### Phase 9: Polish + Docker (Prio 4)
1. Error Handling (Toast Notifications)
2. Loading States (Skeleton Screens)
3. Dockerfile (Multi-Stage: Python slim + nginx)
4. docker-compose.yml mit Volume Mounts
5. Makefile: make dev, make build, make run
6. docs/installation.md aktualisieren (Production Setup)
7. docs/guides/emacs-integration.md

---

## 21. Technische Entscheidungen

| Entscheidung              | Gewaehlt                    | Grund                           |
|---------------------------+-----------------------------+---------------------------------|
| Keine DB fuer Tasks       | Org-Files direkt parsen     | unter 5ms pro Parse, kein Sync  |
| WS nur Notifications      | REST fuer Daten             | Einfaches Protokoll, testbar    |
| Zustand statt Redux       | Minimal Boilerplate         | Single-User App                 |
| APScheduler               | Battle-tested Cron          | Async, Cron-Expressions         |
| watchfiles statt watchdog | Rust-basiert, async         | Zuverlaessig auf macOS          |
| Claude CLI statt API      | Kein Key-Management         | CLI uebernimmt Auth             |
| Hash-basierte Task IDs    | Stabil ueber Re-Reads       | Line-Numbers brechen            |
| Kein In-Memory Cache      | Re-Parse pro Request        | Dateien unter 10KB              |
| gh CLI statt GitHub API   | Kein Token-Management       | gh uebernimmt Auth + Pagination |
| Advisor via oc CLI        | Einheitlicher Codepfad      | Gleiche Validierung wie manuell |
| Issue-Cache mit TTL       | Schnelle Autocomplete       | gh API-Calls sparen             |
| Eine SQLite-Datei         | Alles in omnicontrol.db     | Kein DB-Wildwuchs, ein Backup   |
| Comm-DB statt Memory      | Nachschlagen statt Erinnern | Anti-Halluzination              |
| Attachments in ownCloud   | Dateien in kunden/          | Sync auf alle Geraete           |

---

## 22. Dokumentation

Vollstaendige Dokumentation als Teil des Projekts, nicht als
Nachgedanke. Wird mit jeder Phase aktualisiert.

### Struktur

```
~/develop/omnicontrol/
  docs/
    index.md                     # Startseite, Uebersicht
    quickstart.md                # 5-Minuten Setup
    installation.md              # Ausfuehrliches Dev + Prod Setup

    cli/
      index.md                   # CLI Uebersicht, globale Flags
      task.md                    # oc task -- alle Subcommands
      clock.md                   # oc clock -- alle Subcommands
      customer.md                # oc customer
      inbox.md                   # oc inbox
      comm.md                    # oc comm
      gh.md                      # oc gh
      kb.md                      # oc kb
      cron.md                    # oc cron
      briefing.md                # oc briefing
      ask.md                     # oc ask (Advisor)

    guides/
      email-workflow.md          # Email reinpasten -> Inbox -> Task
      time-tracking.md           # Clock-Workflow, Quick-Book
      github-integration.md      # Repo-Setup, Issue-Referenzen
      cron-jobs.md               # Jobs anlegen, Prompt-Templates
      emacs-integration.md       # Bidirektionale Bearbeitung

    reference/
      config.md                  # Alle Settings + Env-Vars
      org-format.md              # Org-Datei Formate + Konventionen
      api.md                     # REST API Referenz
      websocket.md               # WebSocket Protokoll
      database.md                # SQLite Schema (Comm, FTS, Cron)

    architecture.md              # Architektur-Ueberblick, Schichten
    contributing.md              # Dev-Setup, Tests, Code-Style
```

### Quickstart (docs/quickstart.md)

Ziel: In 5 Minuten von null zum ersten `oc briefing`.

```markdown
# Quickstart

## Voraussetzungen
- Python 3.12+
- gh CLI (`brew install gh && gh auth login`)
- Ollama (optional, fuer AI Advisor)

## Installation
git clone git@github.com:ridingbytes/omnicontrol.git
cd omnicontrol
pip install -e .

## Konfiguration
cp .env.example .env
# Pfade anpassen:
# ORG_DIR=~/ownCloud/cowork/org
# KUNDEN_DIR=~/ownCloud/cowork/kunden

## Erster Start
oc briefing                  # Tagesuebersicht
oc task list                 # Offene Tasks
oc clock status              # Laufender Timer?
oc customer summary          # Budget-Stand
```

### Dev-Setup (docs/contributing.md)

```markdown
# Development Setup

## Repository klonen
git clone git@github.com:ridingbytes/omnicontrol.git
cd omnicontrol

## Python Environment
pyenv install 3.12.12
pyenv local 3.12.12
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

## Test-Fixtures vorbereiten
cp ~/ownCloud/cowork/org/todos.org tests/fixtures/
cp ~/ownCloud/cowork/org/clocks.org tests/fixtures/
cp ~/ownCloud/cowork/org/kunden.org tests/fixtures/

## Tests ausfuehren
pytest tests/ -v

## CLI testen
oc --help
oc task list
oc clock status

## Frontend (spaetere Phase)
cd frontend
npm install
npm run dev               # http://localhost:5173

## Backend-Server (spaetere Phase)
uvicorn omnicontrol.api.app:app --reload  # http://localhost:8000
```

### Production Setup (docs/installation.md)

```markdown
# Production Setup

## Systemd Service (Linux)
# /etc/systemd/system/omnicontrol.service
[Unit]
Description=OmniControl Dashboard
After=network.target

[Service]
Type=simple
User=ramon
WorkingDirectory=/home/ramon/develop/omnicontrol
ExecStart=/home/ramon/develop/omnicontrol/.venv/bin/uvicorn \
    omnicontrol.api.app:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target

## launchd (macOS)
# ~/Library/LaunchAgents/com.ridingbytes.omnicontrol.plist
# Startet automatisch nach Login

## Docker
docker compose up -d

## Nginx Reverse Proxy (optional)
# Frontend auf Port 80/443, API auf /api
```

### CLI Dokumentation (docs/cli/*.md)

Jede CLI-Seite folgt dem gleichen Aufbau:

```markdown
# oc clock

Zeiterfassung: Stunden buchen, Timer starten/stoppen,
Eintraege auflisten.

## Commands

### oc clock book

Nachtraegliche Zeitbuchung.

**Syntax:**
  oc clock book <dauer> <kunde> "<beschreibung>"

**Argumente:**
| Argument     | Beschreibung                   |
|--------------+--------------------------------|
| dauer        | Zeitangabe: 2h, 30min, 1h30min |
| kunde        | Kundenname (aus kunden.org)    |
| beschreibung | Aufgabenbeschreibung           |

**Flags:**
| Flag    | Beschreibung                  |
|---------+-------------------------------|
| --at    | Endzeitpunkt (Default: jetzt) |
| --json  | JSON-Ausgabe                  |
| --quiet | Nur Bestaetigung              |

**Beispiele:**
  # 2 Stunden auf CERMEL buchen
  oc clock book 2h CERMEL "Email Rueckmeldung"

  # 30 Minuten mit Issue-Referenz
  oc clock book 30min ISC "#18 Code Review"

  # Buchung mit bestimmtem Endzeitpunkt
  oc clock book 1h NRG-FMI "Meeting" --at 15:00

**Ergebnis in clocks.org:**
  * CERMEL
  ** Email Rueckmeldung
  :LOGBOOK:
  CLOCK: [2026-04-01 Tue 12:30]--[2026-04-01 Tue 14:30] => 2:00
  :END:

### oc clock start / stop
...

### oc clock list
...

### oc clock summary
...
```

### Generierung

CLI-Dokumentation wird teilweise aus Click-Dekoratoren
generiert (`oc <command> --help`), dann manuell um Beispiele
und Ergebnis-Darstellungen ergaenzt.

Makefile-Target:
```makefile
docs:
	# Click --help Output als Basis generieren
	python scripts/generate_cli_docs.py > docs/cli/_generated.md
	# mkdocs oder sphinx fuer HTML (optional)
	# mkdocs build
```

### Aktualisierungsregel

Jede Phase die CLI Commands oder API Endpoints aendert MUSS
die zugehoerige Dokumentation aktualisieren. Docs sind kein
separater Schritt, sondern Teil der Definition of Done.

## 23. Kritische Dateien (Referenz)

| Datei                                       | Relevant fuer                |
|---------------------------------------------+------------------------------|
| ~/ownCloud/cowork/org/todos.org             | Kanban Parser Format         |
| ~/ownCloud/cowork/org/clocks.org            | Clock Parser Edge Cases      |
| ~/ownCloud/cowork/org/kunden.org            | Customer Parser Budget       |
| ~/ownCloud/cowork/org/inbox.org             | Inbox Format                 |
| ~/ownCloud/cowork/org/archive.org           | Archiv-Format                |
| ~/ownCloud/cowork/scripts/generate-today.py | Org-Parsing Patterns         |
| ~/ownCloud/cowork/wissen/                   | Knowledge Base (67 md, ~1MB) |
| ~/ownCloud/cowork/research/                 | Knowledge Base (16 md)       |
| ~/ownCloud/cowork/bruce/sub-agents/         | Prompt-Templates             |
| ~/ownCloud/cowork/dashboard.html            | Farbschema CSS Vars          |

---

## 24. Verification

### Backend testen
```
cd ~/develop/omnicontrol/backend
pytest tests/ -v
```

Tests muessen Kopien der echten org-Dateien als Fixtures verwenden.

### Frontend testen
```
cd ~/develop/omnicontrol/frontend
npm run dev
# Browser: http://localhost:5173
```

### Integration testen
1. Backend + Frontend starten
2. Kanban Board im Browser laden
3. In Emacs todos.org Task Status aendern
4. Browser muss innerhalb 1-2s aktualisieren
5. Im Browser Task verschieben, in Emacs pruefen
6. Quick-Book: "2h CERMEL Test" eingeben
7. In Emacs clocks.org pruefen ob Eintrag steht

### Cron testen
1. Job in jobs.yaml mit schedule jede Minute
2. Ollama laeuft: ollama list pruefen
3. Job triggern, History pruefen, Output-Datei pruefen

---

## 25. Ergaenzungen (von Ramon nicht explizit genannt)

1. archive.org: DONE Tasks archivieren mit ARCHIVE_TIME und
   ARCHIVE_FILE Properties.

2. Backup: Vor jedem Schreibvorgang .bak Kopie der org-Datei
   anlegen (rotierend, max 5).

3. Keyboard Shortcuts im Frontend:
   - n = neuer Task
   - t = Quick-Book oeffnen
   - / = Suche (Knowledge)
   - 1-7 = Seiten wechseln

4. Dark Mode: Tailwind dark Variante vorbereiten
   (Ramon arbeitet oft abends in Doom Emacs).

5. Responsive: Frontend auf iPad lesbar
   (Ramon hat ein iPad fuer unterwegs).

6. Offline-Toleranz: App laeuft lokal, ownCloud Sync
   passiert im Hintergrund. Org-Files werden lokal gelesen.

7. Export: Monatlicher Stundenbericht pro Kunde als
   Markdown oder CSV, generierbar ueber das Dashboard.

8. notes.org: Fuer Meeting-Notizen und Ad-hoc Notizen.
   Existiert bereits. Spaeter anbinden.

9. CalDAV Integration: generate-today.py hat bereits
   iCloud CalDAV Parsing. Dashboard koennte Termine
   anzeigen. Spaetere Phase.

10. Prompt-Kontext: Cron Jobs die Ollama nutzen sollten
    relevanten Kontext mitbekommen (offene Tasks,
    Kunden-Status, letzte Clocks). Der Executor liest
    dafuer die org-Files und substituiert Template-Variablen.

---

## Implementation Notes (2026-04)

This section documents deviations from the original concept that
emerged during implementation.

### Communications consolidated into inbox

The standalone communications panel (Section 12) was removed.
Channel and direction fields were added directly to inbox items,
giving the inbox the combined capture and logging capability. Cron
jobs drop their findings into the inbox with type "AI". The SQLite
communications table is no longer used; the `comms.org` file and
all comm-related CLI/API/frontend code were removed.

### Customer time entries replaced by clock-based budgets

The concept described separate time entries under customer headings
(Section 6, Budget-Berechnung) with a "Book to project" flow from
clock entries. This was simplified: budget consumption is now
computed as `VERBRAUCHT` property (manual offset) plus the sum of
all clock entry hours for that customer. Contracts carry their own
`VERBRAUCHT` offset. The `customer entries`, `entry-add`,
`entry-edit`, and `entry-delete` CLI commands were removed.

### Contracts

Named contracts were added as sub-headings under customers. Each
contract has its own `KONTINGENT` and `VERBRAUCHT` offset. Clock
entries reference contracts by name. Consumption per contract is
computed from clock data at query time.

### Notes panel

A notes panel was added for freeform notes stored in an org file.
Notes support move-to-task, move-to-KB, and archive actions.

### Inbox and notes "Move" actions

Instead of a single "Promote to task" action, inbox items and notes
can be moved to multiple destinations: Todo (task), Note, Knowledge
base file, or Archive.

### Booked flag removed

The `booked` flag on clock entries (indicating an entry was "booked
to project") was removed along with the time entries system. All
clock entries contribute directly to budget consumption.

### Calendar view

A full-page calendar view was added showing monthly clock entry
data per day cell, with a detail panel for selected dates.

### Content popup

A reusable `ContentPopup` component (expand icon) was added
across task cards, clock entries, inbox items, notes, and cron
output for viewing long content in a modal.
