# Flutter Net Inspector — Dart Package

A Dio interceptor that captures all HTTP traffic and enables real-time mocking, breakpoints, and response modification via a connected VSCode extension dashboard.

Think of it as **Flipper/Stetho for Flutter** — but instead of a standalone desktop app, the dashboard lives inside VSCode.

## Architecture

```
Dio request pipeline:

  App code → Dio.get("/users")
               │
               ▼
  ┌─────────────────────────────────┐
  │   NetInspectorInterceptor       │
  │                                 │
  │   onRequest()                   │
  │     ├─ Tag request with ID      │
  │     ├─ Send metadata to VSCode  │  ◄── WebSocket (InspectorClient)
  │     ├─ Check MockRuleStore      │
  │     │   ├─ Match found (mock)   │──► Return fake Response immediately
  │     │   └─ No match             │──► handler.next() (proceed to server)
  │     │                           │
  │   onResponse()                  │
  │     ├─ Send response to VSCode  │
  │     ├─ Check breakpoint rule    │
  │     │   ├─ Breakpoint active    │──► Pause via Completer, wait for VSCode
  │     │   └─ No breakpoint        │──► handler.next() (pass through)
  │     │                           │
  │   onError()                     │
  │     └─ Send error to VSCode     │
  └─────────────────────────────────┘
               │
               ▼
         App receives Response
```

## Interception Modes

### Passthrough (default)
All requests flow normally. The interceptor captures request/response metadata and forwards it to VSCode via WebSocket for display. Zero impact on app behavior.

### Mock Before Request
When a `MockRule` with `action: mockBeforeRequest` matches the request URL + method, the interceptor short-circuits — it never hits the real server. Returns the configured mock response immediately.

### Breakpoint (Pause & Edit)
When a `MockRule` with `action: breakpoint` matches, the real request goes through to the server. When the response comes back, it's **paused** via a `Completer<MockResponseData?>`. The response data is sent to VSCode, which can either resume (pass original) or send back a modified response.

Timeout is configurable (default 30s) — if VSCode doesn't respond, the original response resumes automatically.

## File Structure

```
lib/
├── flutter_net_inspector.dart    # Barrel export
└── src/
    ├── models.dart               # Protocol models (MessageType, MockRule, CapturedRequest/Response)
    ├── inspector_client.dart      # WebSocket client (connects to VSCode extension server)
    ├── interceptor.dart           # NetInspectorInterceptor (the Dio interceptor)
    └── mock_store.dart            # In-memory store for active mock rules
```

### Key Classes

- **`NetInspectorInterceptor`** — The Dio interceptor. Extends `Interceptor`. Handles `onRequest`, `onResponse`, `onError`. Contains the breakpoint `Completer` map and mock rule matching logic. Entry point for the whole system.

- **`InspectorClient`** — WebSocket client that connects to the VSCode extension's server (default `ws://127.0.0.1:9555/inspector`). Handles auto-reconnection (up to 50 attempts, 3s interval). Sends captured traffic data and receives mock rule commands.

- **`MockRuleStore`** — Stores `MockRule` objects received from VSCode. Provides `findMatch(url, method)` which returns the first matching rule using glob or regex pattern matching.

- **`MockRule`** — Defines a mock rule: URL pattern (glob or regex), HTTP method filter, action type (`mockBeforeRequest` or `breakpoint`), and optional `MockResponseData` (status code, headers, body, simulated delay).

- **`InspectorMessage`** — Envelope for all WebSocket messages. Contains `type` (enum), `id`, `payload` (Map), and `timestamp`.

## WebSocket Protocol

All messages are JSON over WebSocket:

```json
{
  "type": "request_captured",
  "id": "req_42",
  "payload": { ... },
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

### Outgoing (Flutter → VSCode)

| Type                 | Payload fields                                          |
| -------------------- | ------------------------------------------------------- |
| `request_captured`   | id, method, url, headers, body, queryParameters         |
| `response_captured`  | requestId, statusCode, headers, body, durationMs        |
| `error_captured`     | requestId, type, message, statusCode, durationMs        |
| `app_connected`      | appId, platform, dartVersion                            |
| `app_disconnected`   | (empty)                                                 |

### Incoming (VSCode → Flutter)

| Type                | Payload fields                                           |
| ------------------- | -------------------------------------------------------- |
| `mock_rule_add`     | id, urlPattern, method, isRegex, action, mockResponse    |
| `mock_rule_remove`  | ruleId                                                   |
| `mock_rule_update`  | (same as add, overwrites by id)                          |
| `mock_rule_clear`   | (empty)                                                  |
| `modify_response`   | requestId, statusCode, headers, body                     |
| `resume_response`   | requestId                                                |
| `replay_request`    | method, url, headers, body                               |

## Usage

### Basic Setup

```dart
import 'package:dio/dio.dart';
import 'package:flutter_net_inspector/flutter_net_inspector.dart';

final inspector = NetInspectorInterceptor(
  host: '127.0.0.1',  // use 10.0.2.2 for Android emulator
  port: 9555,
  breakpointTimeout: const Duration(seconds: 30),
);

await inspector.connect();

final dio = Dio(BaseOptions(baseUrl: 'https://api.example.com'));
dio.interceptors.insert(0, inspector); // add FIRST
inspector.attachDio(dio);             // enables request replay
```

### Integration with get_it / injectable

```dart
@module
abstract class NetworkModule {
  @singleton
  NetInspectorInterceptor get inspector => NetInspectorInterceptor();

  @singleton
  Dio dio(NetInspectorInterceptor inspector) {
    final dio = Dio(BaseOptions(baseUrl: Env.apiBaseUrl));
    if (kDebugMode) {
      dio.interceptors.insert(0, inspector);
      inspector.attachDio(dio);
    }
    return dio;
  }
}

// In main.dart or AppBloc:
Future<void> initApp() async {
  configureDependencies();
  if (kDebugMode) {
    await getIt<NetInspectorInterceptor>().connect();
  }
}
```

### Conditional Debug-Only Usage

Wrap everything in `kDebugMode` so the interceptor is completely absent in release builds. The WebSocket client auto-reconnects silently, so if the VSCode extension isn't running, there's no crash or visible error — just no dashboard.

## Network Configuration Notes

| Target device      | Host value     | Notes                                    |
| ------------------- | -------------- | ---------------------------------------- |
| iOS Simulator       | `127.0.0.1`   | Shares host network                      |
| Android Emulator    | `10.0.2.2`    | Special alias for host loopback          |
| Physical device     | `127.0.0.1`   | Requires `adb reverse tcp:9555 tcp:9555` |
| Remote (Tailscale)  | Tailscale IP   | Works across network                     |

## Dependencies

- `dio: ^5.9.1` — the only runtime dependency

## Companion Project

This package is designed to work with the **Flutter Net Inspector VSCode Extension** (`../vscode_extension/`). The extension runs a WebSocket server on port 9555 and provides the dashboard UI for viewing traffic and managing mock rules.

The package works standalone too — if no VSCode extension is connected, requests pass through normally with zero overhead beyond the WebSocket reconnect attempts.
