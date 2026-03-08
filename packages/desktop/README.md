# Orthrus Desktop

Native macOS app using Tauri v2, wrapping the web UI from `packages/web/` with a bundled Python backend sidecar.

## Development

```bash
bun run dev:desktop        # relay server + mitmproxy + Tauri dev
bun run build:desktop      # build .app + .dmg locally
```

## Releasing

Releases are automated via GitHub Actions. The workflow builds `.dmg` installers for both Apple Silicon and Intel Macs, then creates a GitHub Release draft.

### First-time setup

1. **Generate signing keys** (for the auto-updater, not Apple code signing):
   ```bash
   cd packages/desktop
   bun tauri signer generate -w ~/.tauri/orthrus.key
   ```

2. **Paste the public key** into `src-tauri/tauri.conf.json`:
   ```bash
   cat ~/.tauri/orthrus.key.pub
   ```
   Replace the `pubkey` value under `plugins.updater`.

3. **Add the private key to GitHub Secrets** (repo → Settings → Secrets → Actions → New repository secret):
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
   - Value: contents of `~/.tauri/orthrus.key`

### Creating a release

1. Bump the version in three files (keep them in sync):
   - `packages/desktop/src-tauri/tauri.conf.json` → `"version"`
   - `packages/desktop/src-tauri/Cargo.toml` → `version`
   - `packages/desktop/package.json` → `"version"`

2. Commit, tag, and push:
   ```bash
   git add -A && git commit -m "release: v0.3.0"
   git tag v0.3.0
   git push origin main --tags
   ```

3. CI builds both architectures → a **draft release** appears in GitHub Releases.

4. Review the draft, edit release notes if needed, then **Publish**.

### What gets uploaded

| File | Purpose |
|------|---------|
| `Orthrus_x.y.z_aarch64.dmg` | Installer for Apple Silicon Macs |
| `Orthrus_x.y.z_x64.dmg` | Installer for Intel Macs |
| `Orthrus.app.tar.gz` | Update bundle (used by auto-updater) |
| `Orthrus.app.tar.gz.sig` | Update signature |
| `latest.json` | Version manifest for auto-updater |

## Auto-Updates

The app includes a built-in updater (via `tauri-plugin-updater`). Users see a "Check for updates" button in the footer bar. When an update is available:

1. User clicks **Update** → downloads in background with progress
2. Download completes → app restarts with the new version

The updater checks `https://github.com/teszerrakt/orthrus/releases/latest/download/latest.json` and verifies update signatures against the public key in `tauri.conf.json`.

## Apple Code Signing (Optional)

Without signing, macOS Gatekeeper shows a warning. Users can bypass with `xattr -cr Orthrus.app`.

To enable signing + notarization, add these GitHub Secrets and uncomment the corresponding env vars in `.github/workflows/release.yml`:

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` Developer ID certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` file |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | App-specific password (not your Apple ID password) |
| `APPLE_TEAM_ID` | Your 10-character Team ID |
