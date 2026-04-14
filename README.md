# Flutter Net Inspector

A **Flipper/Stetho-like** network debugging tool for Flutter apps using Dio.

Two components work together:

| Component | Purpose |
|---|---|
| **Dart package** | Dio interceptor — captures traffic, applies mocks, manages the WebSocket connection to VSCode |
| **VSCode extension** | Dashboard — displays live traffic, lets you create mock rules, set breakpoints, and modify responses in real-time |

---

## Architecture

```
┌─────────────────────┐         WebSocket          ┌──────────────────────────┐
│    Flutter App       │ ◄──── (port 9555) ────►   │   VSCode Extension       │
│                      │                            │                          │
│  Dio                 │   request_captured ──────► │  WebSocket Server        │
│   └─ Interceptor     │   response_captured ────►  │   └─ SessionManager      │
│       ├─ MockStore   │                            │       └─ WebView Panel   │
│       └─ WS Client   │  ◄── mock_rule_add ─────── │           ├─ Traffic Log  │
│                      │  ◄── modify_response ────── │           ├─ Mock Editor  │
│                      │  ◄── resume_response ─────── │           └─ Detail View │
└─────────────────────┘                            └──────────────────────────┘
```

---

## Quick Start

### 1. Install the VSCode extension

```bash
cd vscode_extension
npm install
npm run build:vsix          # produces flutter-net-inspector-x.x.x.vsix
code --install-extension flutter-net-inspector-*.vsix
```

For development, press **F5** inside `vscode_extension/` to launch an Extension Development Host.

### 2. Add the Dart package

```yaml
# pubspec.yaml
dependencies:
  flutter_net_inspector:
    path: ../flutter_net_inspector/flutter_package
```

### 3. Configure host (once, before DI)

The package auto-detects the right host for emulators. For **real devices** you need your machine's LAN IP.

```dart
// main.dart — before your DI graph is built
void main() {
  // Emulators: auto-detected (Android → 10.0.2.2, iOS/others → 127.0.0.1)
  // Real device: set your machine's LAN IP, or use --dart-define (see below)
  // NetInspectorConfig.host = '192.168.1.42';

  configureDependencies();
  runApp(MyApp());
}
```

Or pass it at run time without touching code:

```bash
flutter run --dart-define=INSPECTOR_HOST=192.168.1.42
```

Add that flag to your IDE launch configuration so each developer sets their own IP without changing shared code.

### 4. Wire up the interceptor

```dart
import 'package:flutter_net_inspector/flutter_net_inspector.dart';

// DI module — no host/port needed, NetInspectorConfig handles it
@singleton
NetInspectorInterceptor provideNetInspectorInterceptor() {
  return NetInspectorInterceptor();
}

@singleton
Dio provideDio(NetInspectorInterceptor inspector) {
  final dio = Dio(BaseOptions(baseUrl: Env.apiBaseUrl));
  if (kDebugMode) {
    dio.interceptors.insert(0, inspector); // must be first
    inspector.attachDio(dio);             // enables request replay
  }
  return dio;
}

// main.dart — connect after DI
if (kDebugMode) {
  await getIt<NetInspectorInterceptor>().connect();
}
```

### 5. Open the dashboard

Open the VSCode Command Palette → **Flutter Net Inspector: Open Dashboard**.  
The green dot in the toolbar means the Flutter app is connected.

---

## Device / Host Reference

| Context | Auto-resolved host | Override needed? |
|---|---|---|
| iOS Simulator | `127.0.0.1` | No |
| Android Emulator | `10.0.2.2` | No |
| Android Real Device | — | Yes — LAN IP or `adb reverse` |
| iOS Real Device | — | Yes — LAN IP |
| Remote (Tailscale, etc.) | — | Yes — Tailscale IP |

**`adb reverse` alternative for Android real devices:**
```bash
adb reverse tcp:9555 tcp:9555
# Then the default 127.0.0.1 / 10.0.2.2 will work
```

---

## Interception Modes

### Passthrough (default)
All requests flow to the real server. The interceptor captures request/response metadata and forwards it to the VSCode dashboard. Zero impact on app behavior.

### Mock Before Request
When a mock rule matches a request's URL + method, the interceptor short-circuits — it never contacts the real server. It returns the mock response you configured (status code, headers, body, optional delay) and triggers the app's normal error flow for 4xx/5xx codes (i.e., your `catch (DioException e)` blocks still fire).

**Use cases:** Test error states, simulate slow responses, work offline, reproduce edge cases.

### Breakpoint (Pause & Edit)
When a breakpoint rule matches, the real request goes through to the server. When the response arrives, it's **paused** in the interceptor. The VSCode dashboard highlights the row yellow ("PAUSED").

From the dashboard you can:
- **Resume** — let the original response through unchanged
- **Modify & Send** — edit status code, headers, or body, then send the modified version to the app

A configurable timeout (default 30 s) auto-resumes the original response if you don't act.

**Use cases:** Debug edge cases with real data, simulate server-side changes without deploying.

---

## Dashboard Features

### Traffic list
- **Filter** — search by URL, method, or status code using the toolbar input
- **Tabs** — All / XHR / Mocked / Errors / Mock Rules
- **Sort by time** — click the Time column header to toggle ascending/descending
- **Resize URL column** — drag the divider on the URL column header
- **Clear traffic** — the **⊘ Clear traffic** button on the right side of the tab bar clears all captured entries

### Request detail panel
Select any row to open the detail panel (slides in from the right):
- **Overview** — URL, method, status, duration, query parameters, error info
- **Request** — request body with JSON syntax highlighting
- **Response** — response body with JSON syntax highlighting
- **Headers** — request and response headers

Action buttons: **↻ Replay**, **✦ Mock this**, **▶ Resume** (breakpoint only).

### Mock editor
Open via **+ Mock** in the toolbar, or **✦ Mock this** on a selected request.

| Field | Description |
|---|---|
| URL | Exact URL to match (including query string) |
| Method | HTTP method filter, or "Any method" |
| Action | Mock (skip server) or Breakpoint (pause response) |
| Status code | Dropdown of standard HTTP codes (grouped by 1xx–5xx) |
| Delay (ms) | Simulated latency |
| Response headers | JSON object |
| Response body | JSON editor with syntax highlighting and **{ } Format** button |

**"✦ Mock this"** pre-fills the editor with the selected request's URL and the actual response body/status from the captured entry — change only what you need.

### Mock rules panel
The **Mock Rules** tab shows all active rules as cards. Toggle rules on/off without deleting them.

### Rule persistence
Mock rules are saved to `.vscode/net-inspector-rules.json` in your workspace. Commit this file to share mock setups with your team. Rules are automatically loaded and pushed to connected apps when the extension activates.

---

## Protocol Reference

All messages are JSON over WebSocket:

```json
{
  "type": "request_captured",
  "id": "req_42",
  "payload": { ... },
  "timestamp": "2026-04-14T10:00:00.000Z"
}
```

### Flutter → VSCode

| Type | Payload |
|---|---|
| `request_captured` | id, method, url, headers, body, queryParameters |
| `response_captured` | requestId, statusCode, headers, body, durationMs, mocked |
| `error_captured` | requestId, type, message, statusCode, durationMs |
| `app_connected` | appId, platform, dartVersion |
| `app_disconnected` | (empty) |

### VSCode → Flutter

| Type | Payload |
|---|---|
| `mock_rule_add` | id, urlPattern, method, enabled, action, mockResponse |
| `mock_rule_remove` | ruleId |
| `mock_rule_update` | (same as add, overwrites by id) |
| `mock_rule_clear` | (empty) |
| `modify_response` | requestId, statusCode, headers, body |
| `resume_response` | requestId |
| `replay_request` | method, url, headers, body |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard shows "Waiting..." | Run your Flutter app with the interceptor connected; check the port isn't blocked |
| Android real device can't connect | Set `NetInspectorConfig.host` to your machine's LAN IP, or run `adb reverse tcp:9555 tcp:9555` |
| Mock returns `500` but app doesn't throw | Ensure your Dio instance doesn't have a custom `validateStatus` that accepts all codes |
| Mock fires but body is `null` | The response body field in the editor was empty — pre-fill it via "✦ Mock this" or paste your JSON |
| Extension won't compile | Run `npm install` then `npm run compile` in `vscode_extension/` |

---

## Roadmap

### Done ✅
- Dio interceptor with passthrough capture
- Mock before request (skip server, correct error flow for 4xx/5xx)
- Breakpoint mode (pause & edit response)
- WebSocket communication with auto-reconnect
- VSCode extension dashboard
- Exact URL matching for mock rules
- Platform-aware host auto-detection (`NetInspectorConfig`)
- `--dart-define` host/port override for teams
- Sortable time column, resizable URL column
- JSON syntax highlighting + pretty-print button
- Standard HTTP status code dropdown (1xx–5xx)
- Mock rule persistence (`.vscode/net-inspector-rules.json`)
- Request replay
- HAR export

### Planned
- [ ] Import HAR files
- [ ] Response diff view (original vs modified)
- [ ] Shareable mock rule file sets
- [ ] Conditional rules (match by header, body content, query params)
- [ ] Proxy mode (system-wide via `HttpOverrides`, no Dio dependency)
- [ ] Response recording and session replay
- [ ] CI integration (run tests with pre-configured mocks)
