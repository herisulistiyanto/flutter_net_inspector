# Flutter Net Inspector

A VSCode extension that gives you a real-time network inspector dashboard for your Flutter app — inspect live HTTP traffic, mock any endpoint, set breakpoints on responses, and replay requests, all without leaving VSCode.

Think of it as **Flipper/Stetho for Flutter**, built into your editor.

---

## Requirements

- The companion Dart package [`flutter_net_inspector`](https://pub.dev/packages/flutter_net_inspector) must be added to your Flutter app.
- VSCode 1.85 or later.

---

## Getting started

### 1. Install the Dart package

```yaml
# pubspec.yaml
dependencies:
  flutter_net_inspector: ^0.1.2
```

Wire up the interceptor and call `connect()` in debug mode. Full setup guide: [pub.dev/packages/flutter_net_inspector](https://pub.dev/packages/flutter_net_inspector).

### 2. Open the dashboard

Click the **Net Inspector** icon in the Activity Bar (left sidebar), or open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

```
Flutter Net Inspector: Open Dashboard
```

The dashboard opens in a panel. If the WebSocket server is not yet running, start it with the **Start Server** button in the dashboard or via the `Flutter Net Inspector: Start Server` command. Once the server is running and your Flutter app is connected, traffic appears in real time.

---

## Features

### Live traffic capture
Every HTTP request and response is captured as it happens — method, status code, URL, headers, body, and timing. Filter by URL, method, or status code. Sort by time. Click any row to inspect full details.

### Mock responses
Intercept any endpoint and return a custom response — status code, headers, body, and optional simulated latency — without touching your server or app code. Mocked entries are highlighted in the list so you always know what's real.

Open the **⋮** menu on any captured request row and choose **Mock this** to open the mock editor pre-filled with that request's data.

### Breakpoints
Pause a response mid-flight, inspect and edit its body or status code in the VSCode panel, then resume it. Useful for testing how your app handles edge-case server responses without needing a real server that returns them.

### Request replay
Re-fire any previously captured request from the dashboard with one click.

### Mock rule persistence
Mock rules are saved to `.vscode/net-inspector-rules.json` in your workspace. Commit this file to share mock setups with your team. Rules are restored automatically the next time the extension activates.

---

## UI walkthrough

**Inspect live traffic — Click three-dots for actions**

Every request appears as it happens. Open the context menu to mock the endpoint, replay the request, or copy it as a cURL command. Click the row to open the detail panel with full headers, body, and timing.

![Live traffic and context menu](https://raw.githubusercontent.com/herisulistiyanto/flutter_net_inspector/main/vscode_extension/images/showcase_1.png)

**Configure a mock response**

The mock editor opens pre-filled from the selected request. Adjust the status code, headers, response body, or add a simulated delay — then save. The rule takes effect on the next matching request immediately.

![Mock editor](https://raw.githubusercontent.com/herisulistiyanto/flutter_net_inspector/main/vscode_extension/images/showcase_2.png)

**See the mock in action**

The intercepted row is highlighted with a purple indicator. The detail panel shows the mocked response body, and your Flutter app receives exactly the data you configured.

![Mock active](https://raw.githubusercontent.com/herisulistiyanto/flutter_net_inspector/main/vscode_extension/images/showcase_3.png)

---

## Dashboard overview

| Area | What it does |
|---|---|
| **Toolbar** | Connection status, URL/method/status filter, **+ Mock** button |
| **All / Mocked / Errors / Mock Rules tabs** | Filter the list by category |
| **Request row** | Click to open the detail panel; three-dot menu for Mock, Replay, Copy as cURL |
| **Detail panel** | Overview, Request body, Response body, Headers — resizable by dragging the left edge |
| **Mock Rules tab** | Toggle, edit, or delete saved mock rules |

---

## Extension settings

| Setting | Default | Description |
|---|---|---|
| `flutterNetInspector.port` | `9555` | WebSocket server port |
| `flutterNetInspector.autoStart` | `false` | Start the server not automatically on activation |
| `flutterNetInspector.maxEntries` | `500` | Max requests kept in memory |

---

## Commands

| Command | Description |
|---|---|
| `Flutter Net Inspector: Open Dashboard` | Open or reveal the dashboard panel |
| `Flutter Net Inspector: Start Server` | Start the WebSocket server manually |
| `Flutter Net Inspector: Stop Server` | Stop the server |
| `Flutter Net Inspector: Clear Traffic` | Clear all captured entries |

---

## Real device setup

By default the Dart package connects to `127.0.0.1:9555`. For a physical device you need to point it at your machine's LAN IP, or use `adb reverse` for Android:

```bash
adb reverse tcp:9555 tcp:9555
```

See the [Dart package README](https://pub.dev/packages/flutter_net_inspector) for full host configuration options.
