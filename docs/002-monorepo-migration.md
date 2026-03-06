---
title: "Monorepo Migration"
author: teszerrakt
date_created: 2026-03-06
date_updated: 2026-03-06
status: in-progress
tags: [monorepo, restructure, bun-workspaces, uv-workspace, tauri]
---

# Monorepo Migration

## Goal

Restructure orthrus from a flat project into a `packages/*` monorepo using bun
workspaces (JS/TS) and uv workspaces (Python), preparing for a native macOS app
(Tauri v2) alongside the existing web UI and Python backend.

## Target Structure

```
orthrus/
├── package.json                    # bun workspace root + orchestration scripts
├── pyproject.toml                  # uv workspace root
├── uv.lock
├── .python-version
├── config.json
├── AGENTS.md
├── README.md
├── scripts/
│   ├── install.sh
│   ├── run.sh
│   └── run_dev.sh
├── mocks/
│   ├── _example_full_mock.json
│   ├── _example_inject_error.json
│   └── _example_slow_polling.json
├── docs/
│   ├── 001-implementation-plan.md
│   └── 002-monorepo-migration.md
└── packages/
    ├── web/                        # React frontend (moved from ui/)
    │   ├── AGENTS.md               # web package agent guide (TS/React code style)
    │   ├── package.json            # name: "orthrus-web"
    │   ├── index.html
    │   ├── vite.config.ts
    │   ├── tsconfig.json
    │   ├── tsconfig.app.json
    │   ├── tsconfig.node.json
    │   ├── public/
    │   └── src/
    │       ├── App.tsx
    │       ├── main.tsx
    │       ├── index.css
    │       ├── components/
    │       ├── hooks/
    │       ├── types/
    │       ├── utils/
    │       └── assets/
    ├── desktop/                    # Tauri v2 placeholder
    │   ├── AGENTS.md               # desktop package agent guide (placeholder)
    │   ├── package.json            # name: "orthrus-desktop"
    │   └── README.md
    └── backend/                    # Python backend (moved from root)
        ├── AGENTS.md               # backend package agent guide (Python code style)
        ├── pyproject.toml
        ├── relay_server.py
        ├── addon.py
        └── src/
            ├── __init__.py
            ├── models.py
            ├── session.py
            ├── session_manager.py
            ├── sse_client.py
            ├── sse_parser.py
            ├── mock_loader.py
            ├── pipeline_runner.py
            └── handlers/
                ├── __init__.py
                ├── relay.py
                ├── replay.py
                ├── sessions.py
                ├── websocket.py
                ├── config.py
                └── cert.py
```

---

## Migration Steps

### Phase 1: Cleanup stale artifacts

Remove untracked/unused files left from previous experiments before restructuring.

| Path            | Reason                                                       |
| --------------- | ------------------------------------------------------------ |
| `ui/src-tauri/` | Abandoned Tauri build cache (~333 MB), untracked in git      |
| `backend/`      | Empty dir with only stale `__pycache__`                      |
| `main.py`       | Unused stub ("Hello from orthrus!"), not referenced anywhere |

```bash
rm -rf ui/src-tauri/ backend/ main.py
```

---

### Phase 2: Create root `package.json`

Create a bun workspace root with a dependency catalog for shared versions across
packages, and orchestration scripts that delegate to each package.

```json
{
  "name": "orthrus",
  "private": true,
  "workspaces": {
    "packages": ["packages/*"],
    "catalog": {
      "react": "^19.2.0",
      "react-dom": "^19.2.0",
      "@types/react": "^19.2.7",
      "@types/react-dom": "^19.2.3",
      "typescript": "~5.9.3",
      "tailwindcss": "^4.2.1",
      "@tailwindcss/vite": "^4.2.1",
      "@vitejs/plugin-react": "^5.1.1",
      "vite": "^7.3.1",
      "oxlint": "^1.51.0",
      "oxfmt": "^0.36.0",
      "@types/node": "^25.3.3"
    }
  },
  "scripts": {
    "dev": "./scripts/run_dev.sh",
    "dev:web": "bun --cwd packages/web dev",
    "dev:backend": "cd packages/backend && uv run python relay_server.py",
    "build": "./scripts/run.sh",
    "build:web": "bun --cwd packages/web build",
    "lint": "bun run lint:web && bun run lint:backend",
    "lint:web": "bun --cwd packages/web lint",
    "lint:backend": "cd packages/backend && uv run ruff check .",
    "fmt": "bun run fmt:web",
    "fmt:web": "bun --cwd packages/web fmt",
    "fmt:check": "bun --cwd packages/web fmt:check",
    "typecheck": "bun run typecheck:web && bun run typecheck:backend",
    "typecheck:web": "bun --cwd packages/web tsc -b",
    "typecheck:backend": "cd packages/backend && uv run mypy src/ relay_server.py addon.py",
    "install:all": "./scripts/install.sh"
  }
}
```

---

### Phase 3: Move web UI (`ui/` → `packages/web/`)

1. `mkdir -p packages && mv ui packages/web`
2. Update `packages/web/package.json`:
   - Change `name` from `"orthrus-ui"` to `"orthrus-web"`
   - Replace pinned versions with `"catalog:"` for all shared deps (react,
     react-dom, typescript, tailwindcss, vite, oxlint, oxfmt, etc.)

No other changes needed — all tsconfig paths, vite config, and source imports
are relative within the directory and move as a unit.

---

### Phase 4: Move Python backend (`packages/backend/`)

#### 4a. Move files

```bash
mkdir -p packages/backend
mv relay_server.py addon.py src/ pyproject.toml packages/backend/
```

#### 4b. Create root `pyproject.toml` (uv workspace)

A thin root config so `uv sync` resolves all Python packages from the project root:

```toml
[project]
name = "orthrus-workspace"
version = "0.0.0"
requires-python = ">=3.12"

[tool.uv.workspace]
members = ["packages/backend"]
```

`.python-version` and `uv.lock` stay at root.

#### 4c. Python imports — no changes needed

All `from src.*` imports (33 lines across 11 files) continue to work because:

- `src/` remains a direct child of `packages/backend/`
- Python is always invoked from `packages/backend/` as the CWD (via shell
  scripts and `bun run dev:backend`)
- `uv run` within that directory puts it on `sys.path`

#### 4d. Fix `__file__`-based path references

Introduce `ORTHRUS_ROOT` env var (set at the top of every script) to resolve
cross-package paths robustly. Fall back to computing from `__file__` for direct
invocation outside of scripts.

**`packages/backend/relay_server.py`** — add `import os`, update UI_DIST:

```python
# Before
UI_DIST = Path(__file__).parent / "ui" / "dist"

# After
import os
_PROJECT_ROOT = Path(os.environ.get("ORTHRUS_ROOT", str(Path(__file__).parent.parent.parent)))
UI_DIST = _PROJECT_ROOT / "packages" / "web" / "dist"
```

**`packages/backend/addon.py`** — add `import os`, update CONFIG_FILE:

```python
# Before
CONFIG_FILE = Path(__file__).parent / "config.json"

# After
import os
_PROJECT_ROOT = Path(os.environ.get("ORTHRUS_ROOT", str(Path(__file__).parent.parent.parent)))
CONFIG_FILE = _PROJECT_ROOT / "config.json"
```

**`packages/backend/src/handlers/config.py`** — update CONFIG_FILE (os already imported):

```python
# Before
CONFIG_FILE = Path(__file__).parents[2] / "config.json"

# After
_PROJECT_ROOT = Path(os.environ.get("ORTHRUS_ROOT", str(Path(__file__).parents[3])))
CONFIG_FILE = _PROJECT_ROOT / "config.json"
```

---

### Phase 5: Create `packages/desktop/` placeholder

**`packages/desktop/package.json`:**

```json
{
  "name": "orthrus-desktop",
  "private": true,
  "version": "0.0.0"
}
```

**`packages/desktop/README.md`:**

```markdown
# Orthrus Desktop (Placeholder)

Native macOS app using Tauri v2. Not yet implemented.

## Planned Architecture

- Tauri v2 shell wrapping the web UI from `packages/web/`
- Bundled Python backend via PyInstaller binary
- See `docs/002-monorepo-migration.md` for context
```

---

### Phase 6: Create `scripts/` folder and update shell scripts

Move all three scripts from root into `scripts/` and update every path reference.

```bash
mkdir -p scripts
mv install.sh run.sh run_dev.sh scripts/
chmod +x scripts/install.sh scripts/run.sh scripts/run_dev.sh
```

Key changes in all three scripts:

- Add at the top:
  ```bash
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  export ORTHRUS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  ```
  (scripts are one level deep, so `..` resolves to the project root)

**`scripts/install.sh`** changes:
- Replace `cd ui && bun install` with `bun install` — root workspace install
  resolves all `packages/*` members in one shot
- `uv sync` at root still works via uv workspace

**`scripts/run.sh`** changes:
- UI hash/build paths: `ui/src`, `ui/index.html`, etc. → `$ORTHRUS_ROOT/packages/web/src`, etc.
- UI build command: `(cd ui && bun run build)` → `bun run build:web`
- UI dist hash file: `ui/dist/.build_hash` → `$ORTHRUS_ROOT/packages/web/dist/.build_hash`
- Backend start: `uv run python relay_server.py` →
  `(cd "$ORTHRUS_ROOT/packages/backend" && uv run python relay_server.py --port ...)`
- Addon path: `--scripts addon.py` → `--scripts "$ORTHRUS_ROOT/packages/backend/addon.py"`

**`scripts/run_dev.sh`** changes:
- Backend start: same as `run.sh`
- Addon path: same as `run.sh`
- Vite start: `(cd ui && bun run dev)` → `bun run dev:web`

---

### Phase 7: Update `.gitignore`

Replace current patterns with monorepo-aware paths:

```gitignore
# Python
__pycache__/
*.py[oc]

# Build artifacts
build/
dist/
packages/web/dist/

# Dependencies
.venv/
node_modules/

# Mocks (keep examples)
mocks/*.json
!mocks/_example_*.json

# IDE / OS
.DS_Store
.idea/
.vscode/

# mitmproxy
~/.mitmproxy/

# Tauri (future)
packages/desktop/src-tauri/target/

# Misc
.ruff_cache/
```

---

### Phase 8: Update `AGENTS.md`

Update all sections that reference paths or commands:

| Section                      | Change                                                       |
| ---------------------------- | ------------------------------------------------------------ |
| **Project Structure** tree   | Full replacement with `packages/*` layout                    |
| **Setup** (`./install.sh`)   | → `./scripts/install.sh` (or `bun install:all`)              |
| **Build & Run Commands**     | Update all paths; add `bun run dev`, `bun run build`, etc.   |
| **Python** lint/typecheck    | `cd packages/backend && uv run ...`                          |
| **TypeScript / React** cmds  | `bun --cwd packages/web ...` or `bun run lint:web`           |
| **Environment Variables**    | No changes needed                                            |

---

### Phase 9: Update `README.md`

Update setup instructions, directory structure, and all command examples to
reflect the monorepo layout.

---

## Verification Checklist

After migration, verify the following all work:

- [ ] `./scripts/install.sh` completes (uv sync + bun install across all packages)
- [ ] `./scripts/run_dev.sh` starts all three processes: relay, mitmproxy, vite
- [ ] `./scripts/run.sh` builds web UI and starts production mode
- [ ] Web UI loads at `http://localhost:5173` (dev) and `http://localhost:29000` (prod)
- [ ] SSE interception works end-to-end through mitmproxy
- [ ] `config.json` read/written correctly by `addon.py` and config handler
- [ ] Mock files load from `mocks/` directory
- [ ] `bun run lint` passes from root
- [ ] `bun run typecheck` passes from root
- [ ] `cd packages/backend && uv run ruff check .` passes
- [ ] `cd packages/backend && uv run mypy src/ relay_server.py addon.py` passes

---

## Out of Scope

- Tauri v2 implementation (`packages/desktop/` is a placeholder only)
- Shared package extraction from web UI into a `packages/ui-shared/`
- PyInstaller bundling configuration for the macOS app
- CI/CD pipeline updates
- Turborepo adoption (can be layered on later if needed)
