from __future__ import annotations

import json
from pathlib import Path

from src.handlers.config import _read_config, _write_config


class TestReadConfig:
    """Unit tests for _read_config()."""

    def test_returns_defaults_when_no_file(self, tmp_path: Path) -> None:
        missing = tmp_path / "config.json"
        config = _read_config(missing)
        assert config["sse_patterns"] == [
            {"pattern": "*/sse*", "borrow_cookies": True},
            {"pattern": "*/stream*", "borrow_cookies": True},
        ]
        assert config["relay_host"] == "127.0.0.1"
        assert config["relay_port"] == 29000

    def test_merges_disk_config_with_defaults(self, tmp_path: Path) -> None:
        cfg = tmp_path / "config.json"
        cfg.write_text(json.dumps({"sse_patterns": ["*/events*"], "relay_port": 9999}))
        config = _read_config(cfg)
        assert config["sse_patterns"] == [
            {"pattern": "*/events*", "borrow_cookies": True},
        ]
        assert config["relay_port"] == 9999
        # default relay_host preserved
        assert config["relay_host"] == "127.0.0.1"

    def test_returns_defaults_on_corrupt_json(self, tmp_path: Path) -> None:
        cfg = tmp_path / "config.json"
        cfg.write_text("{invalid json")
        config = _read_config(cfg)
        assert config == {
            "sse_patterns": [
                {"pattern": "*/sse*", "borrow_cookies": True},
                {"pattern": "*/stream*", "borrow_cookies": True},
            ],
            "api_breakpoint_patterns": [],
            "relay_host": "127.0.0.1",
            "relay_port": 29000,
        }


class TestWriteConfig:
    """Unit tests for _write_config()."""

    def test_writes_json_to_disk(self, tmp_path: Path) -> None:
        cfg = tmp_path / "config.json"
        _write_config(cfg, {"sse_patterns": ["*/foo*"], "relay_port": 1234})
        data = json.loads(cfg.read_text())
        assert data["sse_patterns"] == ["*/foo*"]
        assert data["relay_port"] == 1234

    def test_overwrites_existing_file(self, tmp_path: Path) -> None:
        cfg = tmp_path / "config.json"
        cfg.write_text(json.dumps({"sse_patterns": ["*/old*"]}))
        _write_config(cfg, {"sse_patterns": ["*/new*"]})
        data = json.loads(cfg.read_text())
        assert data["sse_patterns"] == ["*/new*"]

    def test_creates_parent_directories(self, tmp_path: Path) -> None:
        cfg = tmp_path / "nested" / "dir" / "config.json"
        _write_config(cfg, {"sse_patterns": ["*/test*"]})
        data = json.loads(cfg.read_text())
        assert data["sse_patterns"] == ["*/test*"]
