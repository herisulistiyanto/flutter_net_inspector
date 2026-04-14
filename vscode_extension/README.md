# Flutter Net Inspector — VSCode Extension

A VSCode extension that provides a network inspector dashboard for Flutter apps. It runs a WebSocket server that receives HTTP traffic from the companion Dart package's Dio interceptor and displays it in a WebView panel with real-time mock and modify capabilities.

---

## Architecture

```
VSCode Extension
├── extension.ts     # Activation, command registration, lifecycle
├── server.ts        # WebSocket server (ws library, port 9555)
│   ├── Accepts connections from Flutter apps
│   ├── Stores NetworkEntry objects in memory (configurable max)
│   ├── Broadcasts mock rules and response modifications to connected apps
│   └── Status bar item showing connection count
├── panel.ts         # WebView panel manager
│   ├── Loads webview/index.html into a VSCode WebView
│   ├── Bridges messages between WebView ↔ Server
│   ├── Persists mock rules to .vscode/net-inspector-rules.json
│   └── HAR file export
└── webview/
    └── index.html   # Dashboard UI (vanilla HTML/CSS/JS, no build step)
```

---

## Message Flow

```
Flutter App                  VSCode Extension                  WebView Panel
    │                               │                                │
    │── request_captured ──────────►│                                │
    │                               │── postMessage ────────────────►│ renders row
    │── response_captured ─────────►│                                │
    │                               │── postMessage ────────────────►│ updates row
    │                               │                                │
    │                               │◄── { command: 'addMockRule' } ─│ user clicks "+ Mock"
    │◄── mock_rule_add ─────────────│                                │
    │                               │                                │
    │                               │◄── { command: 'modifyResponse'}│ user edits breakpointed response
    │◄── modify_response ───────────│                                │
```

---

## Dashboard UI

### Toolbar
- **Connection status** — green/red dot with connected app count
- **Filter input** — search by URL, method, or status code
- **+ Mock** — open the mock rule editor to add a new rule

### Tab bar
- **All** — every captured request
- **XHR** — (future use)
- **Mocked** — requests that were served by a mock rule
- **Errors** — requests that returned 4xx/5xx or threw a network error
- **Mock Rules** — manage active rules
- **⊘ Clear traffic** (far right) — clears all captured entries from the list

### Request list
- Grid columns: Method · Status · URL · Time · Duration
- **URL column** is resizable — drag the divider on the column header
- **Time column** is sortable — click the header to toggle ascending/descending
- Visual indicators:
  - Left red border → error / 4xx–5xx
  - Left purple border → mocked response
  - Left yellow border + pulse animation → breakpoint (paused)
  - "MOCK" / "PAUSED" pills inside the row

### Detail panel
Slides in from the right when a row is selected.

**Tabs:**
- **Overview** — URL, method, status code, duration, timestamp, query parameters, error details
- **Request** — request body with JSON syntax highlighting
- **Response** — response body with JSON syntax highlighting
- **Headers** — request and response header tables

**Action buttons:**
- **↻ Replay** — re-send the captured request through the Flutter app
- **✦ Mock this** — open mock editor pre-filled with this request's URL, method, status code, and response body
- **▶ Resume** — (breakpoint only) let the original response through unchanged

### Mock rule editor (modal)
Opened via **+ Mock** or **✦ Mock this**.

| Field | Description |
|---|---|
| URL | Exact URL to match, including query string |
| Method | HTTP method filter or "Any method" |
| Action | Mock (skip server) or Breakpoint (pause response) |
| Status code | Dropdown of standard HTTP codes grouped by 1xx / 2xx / 3xx / 4xx / 5xx |
| Delay (ms) | Simulated latency before the mock response is returned |
| Response headers | JSON object (default: `{"content-type":"application/json"}`) |
| Response body | JSON editor with live syntax highlighting and **{ } Format** button |

**{ } Format** — pretty-prints the body JSON in place (no-op if not valid JSON).

**"✦ Mock this"** pre-fills all fields from the selected request's captured data so you only change what you need (e.g., just flip the status code to 500).

### Mock Rules panel
Cards showing all active rules. Toggle rules on/off with the switch — disabling a rule removes it from the Flutter app's active set without deleting it from the list.

---

## Mock Rule Persistence

Rules are saved to:
```
<workspace>/.vscode/net-inspector-rules.json
```

Commit this file to share mock setups with your team. On extension activation, persisted rules are loaded and pushed to any connected Flutter apps automatically.

Example format:
```json
[
  {
    "id": "rule_1712900000000",
    "urlPattern": "https://api.example.com/v1/users?page=1",
    "method": "GET",
    "enabled": true,
    "action": "mockBeforeRequest",
    "mockResponse": {
      "statusCode": 200,
      "headers": { "content-type": "application/json" },
      "body": { "users": [], "meta": { "total": 0 } },
      "delayMs": 0
    }
  }
]
```

> Note: `urlPattern` is an **exact URL match**, including query string. Each unique URL + query combination needs its own rule.

---

## Configuration

Extension settings (VSCode Settings UI or `settings.json`):

| Setting | Type | Default | Description |
|---|---|---|---|
| `flutterNetInspector.port` | number | `9555` | WebSocket server port |
| `flutterNetInspector.autoStart` | boolean | `true` | Start server automatically on activation |
| `flutterNetInspector.maxEntries` | number | `500` | Max entries kept in memory (FIFO eviction) |

---

## Commands

| Command | Description |
|---|---|
| `Flutter Net Inspector: Open Dashboard` | Create or reveal the WebView panel (starts server if needed) |
| `Flutter Net Inspector: Start Server` | Start the WebSocket server manually |
| `Flutter Net Inspector: Stop Server` | Stop the server |
| `Flutter Net Inspector: Clear Traffic` | Clear all captured entries |

---

## Development

### Prerequisites
- Node.js 18+
- VSCode 1.85+

### Setup
```bash
cd vscode_extension
npm install
npm run compile      # single build
npm run watch        # rebuild on file changes
```

### Debug (F5)
Open the `vscode_extension/` folder in VSCode, press **F5**. A new Extension Development Host window opens with the extension active.

Open Command Palette → **Flutter Net Inspector: Open Dashboard**.

Debug output appears in the original window's Debug Console. After a `npm run watch` recompile, press **Ctrl+Shift+F5** to restart the Extension Host.

### Build `.vsix`
```bash
npm run build:vsix
```

Produces `flutter-net-inspector-x.x.x.vsix`. Install via:
```bash
code --install-extension flutter-net-inspector-*.vsix
```

---

## WebSocket Protocol

The server listens on `ws://0.0.0.0:<port>/inspector` and accepts JSON messages in the `InspectorMessage` envelope format. See the companion Dart package README for the full protocol reference.

---

## Dependencies

Runtime:
- `ws: ^8.16.0` — WebSocket server

Dev:
- `typescript`, `esbuild`, `@types/vscode`, `@types/ws`, `@types/node`, `prettier`

---

## Companion Project

Designed to work with the **Flutter Net Inspector Dart Package** (`../flutter_package/`). The Dart package provides the `NetInspectorInterceptor` Dio interceptor that connects to this extension's WebSocket server.
