# Flutter Net Inspector — Dart Package

A Dio interceptor that captures all HTTP traffic and enables real-time mocking, breakpoints, and response modification via a connected VSCode extension dashboard.

Think of it as **Flipper/Stetho for Flutter** — but the dashboard lives inside VSCode.

---

## Installation

```yaml
# pubspec.yaml
dependencies:
  flutter_net_inspector:
    path: ../flutter_net_inspector/flutter_package
    # or your private registry / git reference
```

---

## Setup

### Step 1 — Configure host (once, before DI)

`NetInspectorConfig` holds the WebSocket host and port. It picks a sensible default based on the current platform, and can be overridden per developer without touching shared code.

```dart
import 'package:flutter_net_inspector/flutter_net_inspector.dart';

void main() {
  // Default resolution order:
  //   1. --dart-define=INSPECTOR_HOST=<value>  (recommended for teams)
  //   2. 10.0.2.2  on Android  (emulator → host machine alias)
  //   3. 127.0.0.1 everywhere else (iOS Simulator, macOS)
  //
  // Real devices need an explicit host — either:
  //   a) flutter run --dart-define=INSPECTOR_HOST=192.168.1.42
  //   b) NetInspectorConfig.host = '192.168.1.42';  ← set it here

  configureDependencies();
  runApp(MyApp());
}
```

| Device | Default host | Override needed? |
|---|---|---|
| iOS Simulator | `127.0.0.1` | No |
| Android Emulator | `10.0.2.2` | No |
| Android Real Device | — | Yes — LAN IP or `adb reverse tcp:9555 tcp:9555` |
| iOS Real Device | — | Yes — LAN IP |

### Step 2 — Wire up the interceptor

```dart
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_net_inspector/flutter_net_inspector.dart';

// DI module — host/port come from NetInspectorConfig automatically
@module
abstract class NetworkModule {
  @singleton
  NetInspectorInterceptor get inspector => NetInspectorInterceptor();

  @singleton
  Dio dio(NetInspectorInterceptor inspector) {
    final dio = Dio(BaseOptions(baseUrl: Env.apiBaseUrl));
    if (kDebugMode) {
      dio.interceptors.insert(0, inspector); // must be first
      inspector.attachDio(dio);             // enables request replay
    }
    return dio;
  }
}
```

### Step 3 — Connect

```dart
// In main() or AppBloc.init(), after DI is ready
if (kDebugMode) {
  await getIt<NetInspectorInterceptor>().connect();
}
```

The client connects asynchronously and auto-reconnects silently. If the VSCode extension is not running, requests pass through normally with no visible error.

---

## Team Setup (different devices)

The most practical approach for a team is `--dart-define`. Each developer adds this to their IDE launch configuration so no shared code ever changes:

**VS Code `launch.json`:**
```json
{
  "configurations": [
    {
      "name": "Flutter (debug)",
      "request": "launch",
      "type": "dart",
      "args": ["--dart-define=INSPECTOR_HOST=192.168.1.42"]
    }
  ]
}
```

**Android Studio Run Configuration:**  
Edit Configurations → Additional run args → `--dart-define=INSPECTOR_HOST=192.168.1.42`

**Terminal:**
```bash
flutter run --dart-define=INSPECTOR_HOST=192.168.1.42
```

---

## Interception Modes

### Passthrough (default)
All requests flow to the real server. The interceptor captures metadata and forwards it to VSCode via WebSocket. Zero impact on app behavior.

### Mock Before Request
When a `MockRule` with `action: mockBeforeRequest` matches the request's URL + method, the interceptor short-circuits the request — no server contact. It returns the configured mock response directly.

For **error status codes (4xx/5xx)**, the interceptor respects the Dio instance's `validateStatus` setting. By default Dio accepts only 2xx, so mocking a 500 will properly raise a `DioException` with `type: badResponse` and your `catch` blocks will fire as expected.

### Breakpoint (Pause & Edit)
When a `MockRule` with `action: breakpoint` matches, the real request goes to the server. When the response arrives, it's **paused** in a `Completer<MockResponseData?>`. The response data is sent to VSCode for editing.

VSCode sends back either:
- `resume_response` → original response passes through
- `modify_response` → modified response (new status, headers, body) is returned to Dio

A configurable timeout (default 30 s) auto-resumes with the original response if VSCode doesn't respond.

---

## Key Classes

### `NetInspectorConfig`
Static configuration class. Set `host` and `port` before constructing the interceptor. Supports `--dart-define` overrides and platform-aware defaults.

```dart
NetInspectorConfig.host  // default: 10.0.2.2 (Android) / 127.0.0.1 (others)
NetInspectorConfig.port  // default: 9555
```

### `NetInspectorInterceptor`
The Dio interceptor. Extends `Interceptor`. Handles `onRequest`, `onResponse`, `onError`. Manages the breakpoint `Completer` map and mock rule matching.

Constructor parameters are all optional — `host` and `port` default to `NetInspectorConfig` values:

```dart
NetInspectorInterceptor({
  String? host,           // defaults to NetInspectorConfig.host
  int? port,              // defaults to NetInspectorConfig.port
  Duration breakpointTimeout = const Duration(seconds: 30),
  InspectorClient? client, // injectable for testing
})
```

### `InspectorClient`
WebSocket client. Connects to `ws://<host>:<port>/inspector`. Auto-reconnects up to 50 times at 3 s intervals. Sends captured traffic; receives mock rule commands.

### `MockRuleStore`
In-memory store for active `MockRule` objects pushed from VSCode. `findMatch(url, method)` returns the first rule where `rule.urlPattern == url` and the method matches.

### `MockRule`
Defines a single mock rule:

```dart
MockRule({
  required String id,
  required String urlPattern,  // exact URL match (including query string)
  String? method,              // null = match any method
  bool enabled = true,
  MockRuleAction action = MockRuleAction.mockBeforeRequest,
  MockResponseData? mockResponse,
})
```

### `MockResponseData`
The mock response payload:

```dart
MockResponseData({
  required int statusCode,
  Map<String, dynamic> headers = const {},
  dynamic body,
  int? delayMs,  // simulated latency
})
```

### `InspectorMessage`
WebSocket message envelope: `type` (enum), `id` (string), `payload` (Map), `timestamp`.

---

## WebSocket Protocol

All messages are JSON:

```json
{
  "type": "request_captured",
  "id": "req_42",
  "payload": { ... },
  "timestamp": "2026-04-14T10:00:00.000Z"
}
```

### Flutter → VSCode

| Type | Payload fields |
|---|---|
| `request_captured` | id, method, url, headers, body, queryParameters |
| `response_captured` | requestId, statusCode, headers, body, durationMs, mocked |
| `error_captured` | requestId, type, message, statusCode, durationMs |
| `app_connected` | appId, platform, dartVersion |
| `app_disconnected` | (empty) |

### VSCode → Flutter

| Type | Payload fields |
|---|---|
| `mock_rule_add` | id, urlPattern, method, enabled, action, mockResponse |
| `mock_rule_remove` | ruleId |
| `mock_rule_update` | same as add, overwrites by id |
| `mock_rule_clear` | (empty) |
| `modify_response` | requestId, statusCode, headers, body |
| `resume_response` | requestId |
| `replay_request` | method, url, headers, body |

---

## File Structure

```
lib/
├── flutter_net_inspector.dart   # Barrel export
└── src/
    ├── config.dart              # NetInspectorConfig (host/port, platform defaults)
    ├── models.dart              # Protocol models (InspectorMessage, MockRule, etc.)
    ├── inspector_client.dart    # WebSocket client
    ├── interceptor.dart         # NetInspectorInterceptor (Dio interceptor)
    └── mock_store.dart          # In-memory active mock rule store
```

---

## Dependencies

- `dio: ^5.9.1` — only runtime dependency

---

## Companion Project

Designed to work with the **Flutter Net Inspector VSCode Extension** (`../vscode_extension/`). The extension runs the WebSocket server and provides the dashboard UI.

The package works standalone — if no extension is connected, all requests pass through normally with no crash or visible error.
