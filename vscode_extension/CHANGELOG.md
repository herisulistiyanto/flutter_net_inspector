# Changelog

## 0.1.1 — 2026-04-16

- Fixed mock rules not being applied after Flutter hot-restart — active rules are now re-pushed to the app on every reconnect.
- Fixed duplicate rows appearing in the request list after hot-restart.
- Mocked request rows now have a distinct purple background, visible even when the URL is long.
- Detail panel is now resizable by dragging its left edge.
- Added "Copy as cURL" to the per-row context menu.
- Context menu now shows "Edit mock" instead of "Mock this" when a rule already exists for that URL.
- Removed "Mock this" and "Replay" buttons from the detail panel header (available in the per-row menu).

## 0.1.0 — 2026-04-15

Initial release.

- Live HTTP traffic inspector — capture requests, responses, headers, body, and timing from a connected Flutter app.
- Mock any endpoint with a custom status code, headers, body, and optional simulated latency.
- Breakpoint mode — pause a response, edit it in the panel, then resume.
- Request replay from the dashboard.
- Mock rules persist to `.vscode/net-inspector-rules.json` and are shared across the team via source control.
- Resizable URL column.
- Copy any request as a cURL command.
