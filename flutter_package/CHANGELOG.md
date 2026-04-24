# Changelog

## 0.1.2 — 2026-04-23

- Fixed error responses (4xx/5xx) not sending body and headers to the VSCode extension — `onError` now includes `body` and `headers` from the Dio error response.

## 0.1.1 — 2026-04-16

- Fixed mock rules not taking effect on the first requests after a hot-restart. A `rules_synced` handshake now ensures all active rules are loaded before any request is intercepted.
- Fixed duplicate rows in the dashboard after hot-restart caused by request ID collisions. IDs are now session-scoped.
- Fixed connection log spam when the VSCode extension is not running — uses exponential backoff and silences expected connection errors.

## 0.1.0 — 2026-04-15

Initial public release.

- Dio interceptor that streams HTTP traffic to the Flutter Net Inspector VSCode extension.
- Mock responses, breakpoints, and request replay — controlled from the VSCode dashboard.
- Auto-reconnecting WebSocket client with exponential backoff.
- Platform-aware host defaults; override via `--dart-define=INSPECTOR_HOST`.
