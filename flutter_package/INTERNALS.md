# Flutter Net Inspector — Internal Architecture

Developer reference for contributors and maintainers.

---

## Package structure

```
lib/
├── flutter_net_inspector.dart   # Barrel export
└── src/
    ├── config.dart              # NetInspectorConfig — host/port, dart-define resolution
    ├── models.dart              # Protocol models (InspectorMessage, MockRule, etc.)
    ├── inspector_client.dart    # WebSocket client with auto-reconnect + exponential backoff
    ├── interceptor.dart         # NetInspectorInterceptor — Dio interceptor
    └── mock_store.dart          # In-memory active mock rule store
```

---

## Key classes

### `NetInspectorConfig`

Static configuration. Resolved in this order:

1. `--dart-define=INSPECTOR_HOST=<value>` / `INSPECTOR_PORT=<value>`
2. `10.0.2.2` on Android (emulator → host machine alias)
3. `127.0.0.1` everywhere else (iOS Simulator, macOS, web)

```dart
NetInspectorConfig.host  // read/write; read before constructing the interceptor
NetInspectorConfig.port  // default: 9555
```

### `NetInspectorInterceptor`

Extends Dio `Interceptor`. Handles `onRequest`, `onResponse`, `onError`.

Constructor:
```dart
NetInspectorInterceptor({
  String? host,           // defaults to NetInspectorConfig.host
  int? port,              // defaults to NetInspectorConfig.port
  Duration breakpointTimeout = const Duration(seconds: 30),
  InspectorClient? client, // injectable for testing
})
```

Flow:
- `onRequest` — checks `MockRuleStore` for a `mockBeforeRequest` rule; if matched, short-circuits with mock response (no server contact).
- `onResponse` — checks for a `breakpoint` rule; if matched, suspends response in a `Completer` and sends data to VSCode. Auto-resumes after `breakpointTimeout`.
- `onError` — sends error data to VSCode; forwards the error normally.

### `InspectorClient`

WebSocket client connecting to `ws://<host>:<port>/inspector`.

- Auto-reconnects with **exponential backoff**: `base × 2^attempt`, capped at 30 s.
- Sends a handshake (`app_connected`) on connect with `appId`, `platform`, `dartVersion`.
- Exposes a broadcast `Stream<InspectorMessage>` for incoming commands.
- `SocketException` and `HttpException` on connection failure are swallowed silently (expected when server is not running).

### `MockRuleStore`

In-memory `List<MockRule>`. Populated from VSCode commands (`mock_rule_add`, `mock_rule_remove`, `mock_rule_update`, `mock_rule_clear`).

`findMatch(url, method)` — returns first rule where `rule.urlPattern == url` and method matches (null rule method = any method). Disabled rules (`enabled: false`) are skipped.

### `MockRule`

```dart
MockRule({
  required String id,
  required String urlPattern,  // exact URL match (including query string)
  String? method,              // null = any method
  bool enabled = true,
  MockRuleAction action,       // mockBeforeRequest | breakpoint
  MockResponseData? mockResponse,
})
```

### `MockResponseData`

```dart
MockResponseData({
  required int statusCode,
  Map<String, dynamic> headers = const {},
  dynamic body,
  int? delayMs,  // simulated network latency
})
```

### `InspectorMessage`

WebSocket envelope: `type` (enum `MessageType`), `id` (string), `payload` (Map), `timestamp`.

---

## WebSocket protocol

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

## Mock behaviour notes

- **Error status codes (4xx/5xx)**: the interceptor respects the Dio instance's `validateStatus` setting. If Dio rejects the status (default: only 2xx pass), mocking a 4xx/5xx raises a `DioException` with `type: badResponse` — identical to a real server error.
- **Breakpoint timeout**: if VSCode doesn't send `resume_response` or `modify_response` within `breakpointTimeout` (default 30 s), the original response is passed through automatically.
- **Rule matching**: exact URL match only (including query string). Regex/glob matching is not supported in this version.
