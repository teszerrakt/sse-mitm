# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for Orthrus backend.

Bundles relay_server.py + addon.py + src/ into a single executable
that runs both the aiohttp relay and mitmproxy on a shared event loop.

Build: uv run pyinstaller --clean --noconfirm orthrus.spec
"""
from PyInstaller.utils.hooks import (
    collect_data_files,
    collect_submodules,
    copy_metadata,
)

block_cipher = None

# --- Hidden imports ---
# aiohttp ecosystem
hiddenimports = collect_submodules("aiohttp")
hiddenimports += collect_submodules("multidict")
hiddenimports += collect_submodules("yarl")
hiddenimports += collect_submodules("frozenlist")
hiddenimports += collect_submodules("aiosignal")

# mitmproxy ecosystem
hiddenimports += collect_submodules("mitmproxy")
hiddenimports += collect_submodules("cryptography")
hiddenimports += collect_submodules("OpenSSL")
hiddenimports += collect_submodules("certifi")
hiddenimports += collect_submodules("h2")
hiddenimports += collect_submodules("hyperframe")
hiddenimports += collect_submodules("hpack")
hiddenimports += collect_submodules("wsproto")
hiddenimports += collect_submodules("brotli")
hiddenimports += collect_submodules("zstandard")
hiddenimports += collect_submodules("kaitaistruct")
hiddenimports += collect_submodules("asgiref")
hiddenimports += collect_submodules("mitmproxy_rs")
hiddenimports += collect_submodules("aioquic")

# pydantic v2
hiddenimports += collect_submodules("pydantic")
hiddenimports += collect_submodules("pydantic_core")
hiddenimports += ["annotated_types", "typing_extensions"]

# watchfiles (for mock file watching)
hiddenimports += collect_submodules("watchfiles")

# --- Data files ---
datas = []
datas += collect_data_files("mitmproxy")
datas += collect_data_files("certifi")
datas += copy_metadata("mitmproxy")
datas += copy_metadata("aiohttp")
datas += copy_metadata("pydantic")

# Our own src/ package
datas += [("src", "src")]

# --- Analysis ---
a = Analysis(
    ["orthrus_main.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "pytest",
        "unittest",
        "tkinter",
        "_tkinter",
        "mypy",
        "ruff",
    ],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="orthrus-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,
    upx=False,  # UPX breaks macOS code signing
    console=True,
    target_arch=None,  # build for current arch
)
