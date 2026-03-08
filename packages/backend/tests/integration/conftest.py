from __future__ import annotations

import json
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from relay_server import create_app


@pytest.fixture
def tmp_config(tmp_path: Path) -> Path:
    """Return a temporary config.json path with default content."""
    config_file = tmp_path / "config.json"
    config_file.write_text(json.dumps({"sse_patterns": ["*/sse*"]}, indent=2))
    return config_file


@pytest.fixture
def tmp_mocks_dir(tmp_path: Path) -> Path:
    """Return a temporary mocks directory."""
    mocks = tmp_path / "mocks"
    mocks.mkdir()
    return mocks


@pytest_asyncio.fixture
async def app(tmp_mocks_dir: Path, tmp_config: Path) -> web.Application:
    """Create the aiohttp application for testing."""
    return create_app(mocks_dir=tmp_mocks_dir, config_file=tmp_config)


@pytest_asyncio.fixture
async def client(app: web.Application) -> AsyncGenerator[TestClient, None]:
    """Create an aiohttp test client with a running test server."""
    async with TestClient(TestServer(app)) as c:
        yield c
