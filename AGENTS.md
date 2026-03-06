# Orthrus — Agent Guide

## Project Overview

Orthrus is a **mitmproxy-based SSE event debugger**. It intercepts HTTP traffic, captures Server-Sent Events, and provides a browser UI for inspecting, replaying, and mocking SSE streams.

**Architecture:**
```
Mobile/Browser → mitmproxy :28080 → relay server :29000 ↔ WebSocket ↔ Browser UI → Real SSE Server
```

**Stack:**
- **Backend:** Python 3.12, mitmproxy, aiohttp, Pydantic v2
- **Frontend:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS v4
- **Package managers:** `uv` (Python), `bun` (JavaScript)

---

## Prerequisites

- Python 3.12+ (managed via `.python-version`)
- [`uv`](https://docs.astral.sh/uv/) for Python dependency management
- [`bun`](https://bun.sh/) for JavaScript dependency management

---

## Setup

```bash
./install.sh          # installs uv deps + bun deps for ui/
```

---

## Build & Run Commands

### Full stack

```bash
./run_dev.sh          # relay server + mitmproxy + Vite dev server (concurrent, with cleanup)
./run.sh              # relay server + mitmproxy + pre-built UI (production mode)
```

### Python backend

```bash
uv run python relay_server.py          # start relay server alone
uv run mitmdump -s addon.py            # start mitmproxy alone
```

### UI frontend

```bash
cd ui && bun run dev          # Vite dev server (proxies /relay, /ws, /sessions etc. to :29000)
cd ui && bun run build        # production build → ui/dist/
```

---

## Lint, Format & Typecheck

### Python

```bash
uv run ruff check .                          # lint
uv run ruff check --fix .                    # lint + auto-fix
uv run mypy src/ relay_server.py addon.py    # type-check
```

### TypeScript / React

```bash
cd ui && bun run lint           # oxlint src/
cd ui && bun run lint:fix       # oxlint --fix src/
cd ui && bun run fmt            # oxfmt src/
cd ui && bun run fmt:check      # oxfmt --check src/
```

> **Note:** The linter is `oxlint` (not ESLint) and the formatter is `oxfmt` (not Prettier).

---

## Testing

Test framework: `pytest` + `pytest-asyncio`. No tests exist yet.

```bash
uv run pytest                              # run all tests
uv run pytest path/to/test_file.py        # run a single test file
uv run pytest path/to/test_file.py::test_function_name    # run a single test
uv run pytest -k "test_name_pattern"      # run tests matching a pattern
```

---

## Environment Variables

| Variable     | Default      | Description                          |
|--------------|--------------|--------------------------------------|
| `RELAY_PORT` | `29000`      | aiohttp relay server port            |
| `PROXY_PORT` | `28080`      | mitmproxy intercept port             |
| `MOCKS_DIR`  | `./mocks`    | directory for mock JSON response files |

---

## Python Code Style

### Imports

- Always include `from __future__ import annotations` as the **first import** in every Python file.
- Import order: **stdlib** → blank line → **third-party** (aiohttp, pydantic, mitmproxy) → blank line → **local** (`src.*`)
- One import per line for local imports; grouped stdlib imports are acceptable.

### Types

- Use **modern Python type syntax**: `str | None`, `dict[str, str]`, `list[SSEEvent]` — not `Optional[str]`, `Dict`, `List`.
- Annotate **all** function parameters and return types.
- Pydantic models use `model_config = ConfigDict(frozen=True)` by default.
- Use discriminated unions: `Annotated[Union[A, B], Field(discriminator="type")]`.

### Naming Conventions

- `snake_case` for functions, variables, module-level constants use `UPPER_SNAKE_CASE`.
- Private module-level constants: `_UPPER_SNAKE_CASE` (underscore prefix).
- Private instance members: `_name` (underscore prefix).
- Classes: `PascalCase`.

### Logging

```python
logger = logging.getLogger(__name__)   # one logger per module, at module level
```

### Error Handling

- Raise `aiohttp.web.HTTPBadRequest` (or appropriate HTTP exception) for invalid client input.
- Use `try/finally` for resource cleanup in async handlers.
- Avoid bare `except:` — catch specific exception types.

### Async

- Use `async/await` throughout; no blocking I/O on the event loop.
- Use `asyncio.create_task()` for fire-and-forget coroutines.
- No explicit locking needed — single event loop.

### Docstrings

- Triple-quote docstrings on classes and non-trivial public methods.
- For complex handlers, use numbered steps in the docstring.

---

## TypeScript / React Code Style

### Components

- **Functional components only** (no class components).
- Named exports for all components; default export only for `App`.
- Component files: `PascalCase.tsx`. Hook files: `camelCase.ts`.

### Types

- TypeScript strict mode is enforced (`strict: true`, `noUnusedLocals`, `noUnusedParameters`).
- `verbatimModuleSyntax` is enabled — use `import type` for type-only imports.
- `erasableSyntaxOnly` is enabled — avoid `const enum`, namespaces, and decorators.
- No `any` unless absolutely necessary; prefer `unknown` + type narrowing.

### Styling

- **Tailwind CSS v4** — utility classes on elements.
- **CSS custom properties** define the design tokens (see `ui/src/index.css`): `--bg`, `--bg-panel`, `--border`, `--text`, `--accent`, `--success`, `--warning`, `--danger`.
- Use `clsx` / `tailwind-merge` for conditional class composition.
- Use `class-variance-authority` (cva) for component variant patterns.

### Imports

- Use relative imports within `ui/src/`.
- No path aliases configured; keep imports relative and explicit.

---

## Project Structure

```
orthrus/
├── addon.py              # mitmproxy addon (intercepts SSE traffic)
├── relay_server.py       # aiohttp web server + WebSocket relay
├── src/
│   ├── models.py         # Pydantic data models (shared types)
│   ├── session.py        # session state
│   ├── session_manager.py
│   ├── sse_client.py     # upstream SSE client
│   ├── sse_parser.py     # stateful SSE stream parser
│   ├── mock_loader.py    # loads mock JSON from MOCKS_DIR
│   ├── pipeline_runner.py
│   └── handlers/         # one aiohttp route handler per file
│       ├── relay.py
│       ├── replay.py
│       ├── sessions.py
│       ├── websocket.py
│       ├── config.py
│       └── cert.py
├── ui/
│   ├── src/
│   │   ├── components/   # React components (PascalCase.tsx)
│   │   ├── hooks/        # custom hooks (useX.ts)
│   │   ├── types/        # shared TypeScript types (index.ts)
│   │   └── utils/        # utility functions
│   ├── src-tauri/        # Tauri native app shell (macOS)
│   └── vite.config.ts
├── mocks/                # mock JSON files (gitignored except _example_*)
├── pyproject.toml        # Python project config (uv, ruff, mypy, pytest)
├── install.sh
├── run.sh
└── run_dev.sh
```
