from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from src.handlers.config import _read_config, _write_config


class TestReadConfig:
    """Unit tests for _read_config()."""

    def test_returns_defaults_when_no_file(self, tmp_path: Path) -> None:
        missing = tmp_path / "config.json"
        with patch("src.handlers.config.CONFIG_FILE", missing):
            config = _read_config()
        assert config["sse_patterns"] == ["*/sse*", "*/stream*"]
        assert config["relay_host"] == "127.0.0.1"
        assert config["relay_port"] == 29000

    def test_merges_disk_config_with_defaults(self, tmp_path: Path) -> None:
        cfg = tmp_path / "config.json"
        cfg.write_text(json.dumps({"sse_patterns": ["*/events*"], "relay_port": 9999}))
        with patch("src.handlers.config.CONFIG_FILE", cfg):
            config = _read_config()
        assert config["sse_patterns"] == ["*/events*"]
        assert config["relay_port"] == 9999
        # default relay_host preserved
        assert config["relay_host"] == "127.0.0.1"

    def test_returns_defaults_on_corrupt_json(self, tmp_path: Path) -> None:
        cfg = tmp_path / "config.json"
        cfg.write_text("{invalid json")
        with patch("src.handlers.config.CONFIG_FILE", cfg):
            config = _read_config()
        assert config == {
            "sse_patterns": ["*/sse*", "*/stream*"],
            "api_breakpoint_patterns": [],
            "relay_host": "127.0.0.1",
            "relay_port": 29000,
        }


class TestWriteConfig:
    """Unit tests for _write_config()."""

    def test_writes_json_to_disk(self, tmp_path: Path) -> None:
        cfg = tmp_path / "config.json"
        with patch("src.handlers.config.CONFIG_FILE", cfg):
            _write_config({"sse_patterns": ["*/foo*"], "relay_port": 1234})
        data = json.loads(cfg.read_text())
        assert data["sse_patterns"] == ["*/foo*"]
        assert data["relay_port"] == 1234

    def test_overwrites_existing_file(self, tmp_path: Path) -> None:
        cfg = tmp_path / "config.json"
        cfg.write_text(json.dumps({"sse_patterns": ["*/old*"]}))
        with patch("src.handlers.config.CONFIG_FILE", cfg):
            _write_config({"sse_patterns": ["*/new*"]})
        data = json.loads(cfg.read_text())
        assert data["sse_patterns"] == ["*/new*"]
