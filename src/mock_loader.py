from __future__ import annotations

import json
import logging
from pathlib import Path

from watchfiles import awatch

from src.models import MockConfig, PipelineStep

logger = logging.getLogger(__name__)


def _load_file(path: Path) -> MockConfig | None:
    """Load and validate a single JSON mock file. Returns None on failure."""
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        config = MockConfig.model_validate(data)
        return config
    except Exception as exc:
        logger.warning("Failed to load mock file %s: %s", path, exc)
        return None


class MockLoader:
    """
    Loads mock JSON files from a directory and watches for changes.

    Only one mock may have ``enabled: true`` at a time. If multiple files
    are enabled, a warning is logged and the first one (alphabetically) wins.
    """

    def __init__(self, mocks_dir: Path) -> None:
        self._dir = mocks_dir
        self._loaded: dict[str, MockConfig] = {}  # stem → config
        self._active: MockConfig | None = None

    # ------------------------------------------------------------------
    # Initial load
    # ------------------------------------------------------------------

    def load_all(self) -> None:
        """Load all *.json files from the mocks directory synchronously."""
        if not self._dir.exists():
            self._dir.mkdir(parents=True, exist_ok=True)

        for path in sorted(self._dir.glob("*.json")):
            config = _load_file(path)
            if config is not None:
                self._loaded[path.stem] = config

        self._update_active()

    # ------------------------------------------------------------------
    # File watcher (async)
    # ------------------------------------------------------------------

    async def start_watching(self) -> None:
        """Watch the mocks directory for changes and hot-reload files."""
        self._dir.mkdir(parents=True, exist_ok=True)
        logger.info("Watching mocks directory: %s", self._dir)

        async for changes in awatch(str(self._dir)):
            for _change_type, path_str in changes:
                path = Path(path_str)
                if path.suffix != ".json":
                    continue

                if path.exists():
                    config = _load_file(path)
                    if config is not None:
                        self._loaded[path.stem] = config
                        logger.info("Reloaded mock: %s", path.name)
                    else:
                        # File exists but failed validation — remove stale entry
                        self._loaded.pop(path.stem, None)
                else:
                    # File deleted
                    self._loaded.pop(path.stem, None)
                    logger.info("Removed mock: %s", path.name)

            self._update_active()

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_active(self) -> MockConfig | None:
        return self._active

    def get_all(self) -> list[MockConfig]:
        return list(self._loaded.values())

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _update_active(self) -> None:
        enabled = [c for c in self._loaded.values() if c.enabled]
        if len(enabled) > 1:
            names = [c.name for c in enabled]
            logger.warning(
                "Multiple enabled mocks found: %s. Only the first will be used.",
                names,
            )
        self._active = enabled[0] if enabled else None
        if self._active:
            logger.info("Active mock: '%s'", self._active.name)
        else:
            logger.info("No active mock — all requests pass through.")
