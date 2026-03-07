declare const __APP_VERSION__: string;
declare const __COMMIT_HASH__: string;

/**
 * Displays the app version and commit hash.
 * Composable — place inside AppFooter.
 */
export function VersionInfo() {
  return (
    <span className="text-xs text-dim font-mono select-none">
      v{__APP_VERSION__}-{__COMMIT_HASH__}
    </span>
  );
}
