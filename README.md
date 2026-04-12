# Flutter Net Inspector

A **Flipper/Stetho-like** network debugging tool for Flutter apps using Dio.

Two components:
1. **Dart package** — A Dio interceptor that captures all network traffic and supports real-time mocking
2. **VSCode extension** — A desktop dashboard that displays network traffic and lets you create mock rules, set breakpoints, and modify responses live

## Architecture

```
┌─────────────────────┐         WebSocket          ┌─────────────────────────┐
│    Flutter App       │ ◄──── (port 9555) ────►   │   VSCode Extension      │
│                      │                            │                         │
│  Dio                 │   request_captured ──────► │  WebSocket Server       │
│   └─ Interceptor     │   response_captured ────►  │   └─ SessionManager     │
│       ├─ MockStore   │                            │       └─ WebView Panel  │
│       └─ WS Client   │  ◄── mock_rule_add ────── │           ├─ Traffic Log │
│                      │  ◄── modify_response ───── │           ├─ Mock Editor │
│                      │  ◄── resume_response ───── │           └─ Detail View│
└─────────────────────┘                            └─────────────────────────┘
```

## Interception Modes

### 1. Passthrough (default)
All requests flow normally. The interceptor just captures and forwards metadata to VSCode for display. Zero impact on app behavior.

### 2. Mock Before Request
When a mock rule with `action: mockBeforeRequest` matches a request URL + method, the interceptor short-circuits — it never hits the real server. Instead, it returns the mock response you configured in VSCode immediately.

**Use case**: Test error states, simulate slow responses, work offline.

### 3. Breakpoint (Pause & Edit)
When a mock rule with `action: breakpoint` matches, the real request goes through to the server normally. But when the response comes back, it's **paused** — the interceptor holds it via a `Completer` and sends the response data to VSCode for editing.

In VSCode, you see the response highlighted yellow ("PAUSED"). You can:
- **Resume**: Let the original response through unchanged
- **Modify & Send**: Edit the status code, headers, or body, then send the modified version back to the app

The interceptor has a configurable timeout (default 30s) — if you don't act, the original response resumes automatically.

**Use case**: Debug specific API responses, test edge cases with real request data, simulate server-side changes without deploying.

## Setup

### Flutter Package

```yaml
# pubspec.yaml
dependencies:
  flutter_net_inspector:
    path: ../flutter_net_inspector/flutter_package
    # or publish to a private registry
```

```dart
import 'package:flutter_net_inspector/flutter_net_inspector.dart';

// In your dependency injection setup:
final inspector = NetInspectorInterceptor(
  host: '127.0.0.1',  // localhost for emulators
  port: 9555,
);

// Connect (non-blocking, auto-reconnects)
await inspector.connect();

// Add to Dio FIRST (before auth interceptors, etc.)
dio.interceptors.insert(0, inspector);
```

**For Android emulator**: Use `10.0.2.2` instead of `127.0.0.1` to reach the host machine.

**For physical devices**: Use your machine's local IP, or set up adb port forwarding:
```bash
adb reverse tcp:9555 tcp:9555
```

### VSCode Extension

```bash
cd vscode_extension
npm install
npm run compile

# For development:
# Press F5 in VSCode to launch Extension Development Host

# For packaging:
npx @vscode/vsce package
```

Then install the `.vsix` file via VSCode → Extensions → Install from VSIX.

## Usage

1. Open VSCode, run command: **Flutter Net Inspector: Open Dashboard**
2. Run your Flutter app (with the interceptor connected)
3. The green dot in the toolbar indicates connection

### Creating a Mock Rule

Click **"+ Mock Rule"** in the toolbar:

| Field        | Description                                              |
|------------- |--------------------------------------------------------- |
| URL pattern  | Glob (`*/users*`) or regex match against the full URL    |
| Method       | HTTP method filter (or "Any")                            |
| Status code  | Response status code to return                           |
| Action       | `Mock (skip server)` or `Breakpoint (pause)`             |
| Delay        | Simulated latency in milliseconds                        |
| Body         | JSON response body                                       |

### Breakpoint Workflow

1. Add a mock rule with action = **Breakpoint**
2. Trigger the matching request in your app
3. The response row appears **yellow** in the dashboard with a "PAUSED" badge
4. Click the row → click **"Modify & Send"** → edit the JSON → click **"Send modified response"**
5. The app receives your modified response and continues

## Protocol Reference

All messages are JSON over WebSocket:

```json
{
  "type": "request_captured | response_captured | mock_rule_add | ...",
  "id": "unique_id",
  "payload": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Flutter → VSCode

| Type                | Payload                                             |
|-------------------- |---------------------------------------------------- |
| `request_captured`  | id, method, url, headers, body, queryParameters     |
| `response_captured` | requestId, statusCode, headers, body, durationMs    |
| `error_captured`    | requestId, type, message, statusCode, durationMs    |
| `app_connected`     | appId, platform, dartVersion                        |

### VSCode → Flutter

| Type               | Payload                                              |
|------------------- |----------------------------------------------------- |
| `mock_rule_add`    | id, urlPattern, method, action, mockResponse         |
| `mock_rule_remove` | ruleId                                               |
| `mock_rule_update` | (same as add, overwrites by id)                      |
| `mock_rule_clear`  | (empty)                                              |
| `modify_response`  | requestId, statusCode, headers, body                 |
| `resume_response`  | requestId                                            |

## Development Roadmap

### Phase 1 (Current) ✅
- [x] Dio interceptor with passthrough capture
- [x] Mock before request (skip server)
- [x] Breakpoint mode (pause & edit response)
- [x] WebSocket communication protocol
- [x] VSCode extension with WebView dashboard
- [x] Basic traffic filtering
- [x] JSON syntax highlighting in detail view
- [x] Quick mock presets (401, 404, 500, slow responses, etc.)
- [x] Mock rule persistence (`.vscode/net-inspector-rules.json`)
- [x] HAR file export
- [x] Request replay (re-fire captured requests from VSCode)

### Phase 2
- [ ] Import HAR files
- [ ] Response diff view (original vs modified)
- [ ] Mock rule presets as sharable files

### Phase 3
- [ ] Conditional mock rules (match by header, body content, query params)
- [ ] Proxy mode (intercept even without Dio — system-wide via HttpOverrides)
- [ ] Response recording (capture and replay entire sessions)
- [ ] Performance metrics (request timeline, waterfall view)
- [ ] GraphQL support (query/mutation-level inspection)

### Phase 4
- [ ] Team sharing (shared mock rule sets via git)
- [ ] CI integration (run tests with pre-configured mocks)
- [ ] Dedicated desktop app alternative (Electron/Tauri) for non-VSCode users

## Key Design Decisions

### Why WebSocket over DevTools protocol?
Flutter DevTools extensions use the VM service protocol which is powerful but complex and tightly coupled to the DevTools UI. A raw WebSocket is simpler, portable (works with any IDE), and gives full control over the protocol. You can also connect multiple apps simultaneously.

### Why VSCode extension over standalone app?
Most Flutter devs already live in VSCode. An extension integrates naturally into the workflow — no context switching. The WebView API gives enough UI capability for a dashboard. If demand exists, a standalone Electron/Tauri app can be added later using the same WebSocket protocol.

### Why not use `dart:io` HttpOverrides?
`HttpOverrides` intercepts at the `HttpClient` level, which would catch everything including package manager requests, Firebase calls, etc. A Dio interceptor is surgical — it only captures your API traffic. If you want system-wide capture later, `HttpOverrides` can be added as an optional mode.

## Debugging Tips

- **Can't connect?** Check port 9555 isn't blocked. For Android emulator use `10.0.2.2` or `adb reverse`.
- **iOS simulator**: `127.0.0.1` works directly since the simulator shares the host network.
- **Tailscale/VPN**: If your Mac Mini server is on Tailscale, you can use the Tailscale IP to inspect traffic from physical devices remotely.
- **Multiple apps**: The server supports multiple simultaneous connections. Each app gets its own handshake and all traffic is interleaved in the dashboard.
