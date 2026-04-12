# Flutter Net Inspector — VSCode Extension

A VSCode extension that provides a network inspector dashboard for Flutter apps. It runs a WebSocket server that receives HTTP traffic from the companion Dart package's Dio interceptor, and displays it in a WebView panel with real-time mock/modify capabilities.

## Architecture

```
VSCode Extension
├── extension.ts          # Activation, command registration, lifecycle
├── server.ts             # WebSocket server (ws library, port 9555)
│   ├── Accepts connections from Flutter apps
│   ├── Stores NetworkEntry objects in memory
│   ├── Broadcasts mock rules / response modifications to connected apps
│   └── Status bar item showing connection state
├── panel.ts              # WebView panel manager
│   ├── Loads webview/index.html into a VSCode WebView
│   ├── Bridges messages between WebView ↔ Server
│   ├── Persists mock rules to .vscode/net-inspector-rules.json
│   └── HAR file export
└── webview/
    └── index.html        # Dashboard UI (vanilla HTML/CSS/JS)
        ├── Request list with filtering and tabs
        ├── Detail panel with JSON syntax highlighting
        ├── Mock rule editor with quick presets
        └── Breakpoint controls (resume / modify response)
```

## Message Flow

```
Flutter App                     VSCode Extension                    WebView Panel
    │                               │                                    │
    │── request_captured ──────────►│                                    │
    │                               │── postMessage(request_captured) ──►│
    │                               │                                    │ renders row
    │── response_captured ─────────►│                                    │
    │                               │── postMessage(response_captured) ─►│
    │                               │                                    │ updates row
    │                               │                                    │
    │                               │◄── { command: 'addMockRule' } ─────│ user clicks "+ Mock"
    │◄── mock_rule_add ─────────────│                                    │
    │                               │                                    │
    │                               │◄── { command: 'modifyResponse' } ──│ user edits breakpointed response
    │◄── modify_response ───────────│                                    │
```

## File Descriptions

### `src/extension.ts`
Entry point. Registers four commands:
- `flutterNetInspector.open` — creates/reveals the WebView panel (starts server if needed)
- `flutterNetInspector.startServer` — starts the WebSocket server manually
- `flutterNetInspector.stopServer` — stops the server
- `flutterNetInspector.clearTraffic` — clears captured entries

Reads configuration from `flutterNetInspector.*` settings (port, autoStart, maxEntries). Auto-starts the server on activation if `autoStart` is true.

### `src/server.ts`
`InspectorServer` class. Core responsibilities:
- **WebSocket server** using the `ws` npm package on configurable port (default 9555)
- **Client tracking** — maintains a `Set<WebSocket>` of connected Flutter apps
- **Entry storage** — `Map<string, NetworkEntry>` with configurable max size (default 500, FIFO eviction)
- **Broadcasting** — `broadcast(message)` sends JSON to all connected clients
- **Message handling** — `handleFlutterMessage()` processes incoming traffic data and updates stored entries
- **Status bar** — shows connection count and server state in VSCode's status bar
- **Public API methods**: `addMockRule()`, `removeMockRule()`, `modifyResponse()`, `resumeResponse()`, `replayRequest()`, `getEntries()`, `clearEntries()`

The `NetworkEntry` interface:
```typescript
interface NetworkEntry {
  id: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  queryParameters: Record<string, string>;
  requestTimestamp: string;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  durationMs?: number;
  mocked?: boolean;
  breakpoint?: boolean;
  error?: { type: string; message: string };
}
```

### `src/panel.ts`
`InspectorPanel` class. Manages the WebView lifecycle:
- **HTML loading** — reads `webview/index.html`, injects CSP nonce and source
- **Message bridge** — forwards server events to WebView via `postMessage()`, handles WebView commands (addMockRule, modifyResponse, resumeResponse, clearTraffic, replayRequest, persistRules, exportHar)
- **Mock rule persistence** — saves/loads rules to `.vscode/net-inspector-rules.json` in the workspace root. Rules auto-load on panel creation and are pushed to connected Flutter apps.
- **HAR export** — converts stored entries to HAR 1.2 format, prompts save dialog

Uses `retainContextWhenHidden: true` so the WebView keeps its state when the tab is not visible.

### `webview/index.html`
Single-file dashboard UI. No build step, no framework — vanilla HTML/CSS/JS using VSCode's CSS variables for theming (auto light/dark mode).

**Layout**: CSS Grid — toolbar (top), tab bar, request list. When a request is selected, detail panel appears on the right via grid column change.

**Key UI components**:
- **Toolbar** — connection status dot, search/filter input, Clear button, "+ Mock" button
- **Tab bar** — All (with count), XHR, Mocked (with count), Errors (with count), Mock Rules (with count)
- **Request list** — grid rows showing method (color-coded), status code, URL path, timestamp, duration. Visual indicators: left border color for errors (red), mocked (purple), breakpoint (yellow with pulse animation). Pills: "MOCK" and "PAUSED" badges.
- **Detail panel** — slides in from right. Tabs: Overview (general info, query params, errors), Request (body with JSON syntax highlighting), Response (body), Headers (request + response tables). Action buttons: Replay, Resume (breakpoint), Modify (breakpoint).
- **Mock editor** — modal overlay. Fields: URL pattern, method, action (mock/breakpoint), status code, delay. Quick presets row (200, 201, 204, 400, 401, 403, 404, 422, 429, 500, 503, slow, empty array). Response headers and body textarea. Regex toggle checkbox.
- **JSON syntax highlighting** — custom `syntaxHL()` function that colorizes keys (blue), strings (orange), numbers (green), booleans (blue), null (gray) using regex replacement.

**Communication with extension**: Uses `acquireVsCodeApi()` to get the `vscode` object. Sends commands via `vscode.postMessage({ command, data })`. Receives events via `window.addEventListener('message', ...)`.

**State management**: Plain JS variables (`entries[]`, `mockRules[]`, `selectedId`, `currentMainTab`, `currentDetailTab`, `filterText`). Re-renders by rebuilding `innerHTML` on state change.

## Configuration

Extension settings in `package.json` → `contributes.configuration`:

| Setting                          | Type    | Default | Description                     |
| -------------------------------- | ------- | ------- | ------------------------------- |
| `flutterNetInspector.port`       | number  | 9555    | WebSocket server port           |
| `flutterNetInspector.autoStart`  | boolean | true    | Auto-start server on activation |
| `flutterNetInspector.maxEntries` | number  | 500     | Max network entries in memory   |

## Development

### Prerequisites
- Node.js 18+
- VSCode 1.85+

### Setup
```bash
npm install
npm run compile
```

### Debug (F5)
Open this folder in VSCode, press F5. A new "Extension Development Host" window launches with the extension active. Open Command Palette → "Flutter Net Inspector: Open Dashboard".

Debug console in the original window shows `console.log` output from the extension.

`npm run watch` auto-recompiles on `.ts` changes. Press `Ctrl+Shift+F5` to restart the Extension Host after recompile.

### Build .vsix
```bash
npm install -g @vscode/vsce
vsce package --allow-missing-repository
```

Produces `flutter-net-inspector-0.1.0.vsix`. Install via:
```bash
code --install-extension flutter-net-inspector-0.1.0.vsix
```

## Mock Rule Persistence

When mock rules are created in the dashboard, they're saved to:
```
<workspace>/.vscode/net-inspector-rules.json
```

This file can be committed to git for team sharing. On extension activation, persisted rules are loaded and pushed to any connected Flutter apps automatically.

Format:
```json
[
  {
    "id": "rule_1712900000000",
    "urlPattern": "*/api/v1/users*",
    "method": "GET",
    "isRegex": false,
    "enabled": true,
    "action": "mockBeforeRequest",
    "mockResponse": {
      "statusCode": 200,
      "headers": { "content-type": "application/json" },
      "body": { "users": [] },
      "delayMs": 500
    }
  }
]
```

## WebSocket Protocol

See the companion Dart package README for the full protocol reference. The server listens on `ws://0.0.0.0:{port}/inspector` and accepts JSON messages matching the `InspectorMessage` envelope format.

## Dependencies

- `ws: ^8.16.0` — WebSocket server implementation
- `@types/ws`, `@types/node`, `@types/vscode`, `typescript` — dev dependencies

## Companion Project

This extension is designed to work with the **Flutter Net Inspector Dart Package** (`../flutter_package/`). The Dart package provides the `NetInspectorInterceptor` Dio interceptor that connects to this extension's WebSocket server.

## Roadmap

- [ ] Import HAR files to replay saved sessions
- [ ] Response diff view (original vs modified side-by-side)
- [ ] Conditional mock rules (match by header values, body content, query params)
- [ ] WebView performance: virtual scrolling for large traffic volumes
- [ ] Standalone Electron/Tauri app using the same WebSocket protocol
- [ ] Tree view in the activity bar sidebar for quick mock rule toggling
