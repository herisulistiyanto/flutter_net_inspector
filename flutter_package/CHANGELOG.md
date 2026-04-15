# Changelog

## 0.1.0 — 2026-04-15

Initial public release.

- Dio interceptor that streams HTTP traffic to the Flutter Net Inspector VSCode extension.
- Mock responses, breakpoints, and request replay — controlled from the VSCode dashboard.
- Auto-reconnecting WebSocket client with exponential backoff.
- Platform-aware host defaults; override via `--dart-define=INSPECTOR_HOST`.
