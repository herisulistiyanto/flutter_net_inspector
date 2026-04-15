# Flutter Net Inspector VSCode Extension — Internal Architecture

Developer reference for contributors and maintainers.

---

## Extension structure

```
vscode_extension/
├── src/
│   ├── extension.ts     # Activation, command registration, lifecycle
│   ├── server.ts        # WebSocket server (ws library, port 9555)
│   └── panel.ts         # WebView panel manager
└── webview/
    └── index.html       # Dashboard UI (vanilla HTML/CSS/JS, no build step)
```

### `extension.ts`
Entry point. Registers commands, creates the `NetInspectorServer` and `NetInspectorPanel` singletons on activation, handles the status bar item.

### `server.ts`
Runs `ws` on `0.0.0.0:<port>/inspector`. Responsibilities:
- Accept WebSocket connections from Flutter apps.
- Store `NetworkEntry` objects in memory (FIFO eviction at `maxEntries`).
- Broadcast mock rules and response modifications to all connected apps.
- Emit events consumed by `panel.ts` to update the WebView.

### `panel.ts`
Manages the VSCode `WebviewPanel`. Responsibilities:
- Load `webview/index.html` with a CSP nonce.
- Bridge messages between the WebView (`postMessage` / `onDidReceiveMessage`) and `server.ts`.
- Persist mock rules to `.vscode/net-inspector-rules.json` on every change.
- Load persisted rules on activation and push them to connected apps.

### `webview/index.html`
Single-file vanilla HTML/CSS/JS dashboard. No bundler or framework.
- Communicates with `panel.ts` via `vscode.postMessage` / `window.addEventListener('message', ...)`.
- Renders the request list, detail panel, mock editor modal, and mock rules panel.
- URL column width and detail panel width are resizable via drag handles.

---

## Message flow

```
Flutter App                  server.ts                    panel.ts / WebView
    │                            │                               │
    │── request_captured ───────►│                               │
    │                            │── postMessage ───────────────►│ renders row
    │── response_captured ───────►│                               │
    │                            │── postMessage ───────────────►│ updates row
    │                            │                               │
    │                            │◄── { command: 'addMockRule' } ─│ user clicks "+ Mock"
    │◄── mock_rule_add ──────────│                               │
    │                            │                               │
    │                            │◄── { command: 'modifyResponse'}│ user edits breakpoint
    │◄── modify_response ────────│                               │
```

---

## WebSocket protocol

All messages use the `InspectorMessage` JSON envelope:

```json
{
  "type": "request_captured",
  "id": "req_42",
  "payload": { ... },
  "timestamp": "2026-04-14T10:00:00.000Z"
}
```

### Flutter → Extension

| Type | Payload fields |
|---|---|
| `request_captured` | id, method, url, headers, body, queryParameters |
| `response_captured` | requestId, statusCode, headers, body, durationMs, mocked |
| `error_captured` | requestId, type, message, statusCode, durationMs |
| `app_connected` | appId, platform, dartVersion |
| `app_disconnected` | (empty) |

### Extension → Flutter

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

## Mock rule persistence format

Saved to `<workspace>/.vscode/net-inspector-rules.json`:

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

`urlPattern` is an **exact URL match** including query string. Each unique URL + query combination needs its own rule.

---

## Development setup

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

Produces `flutter-net-inspector-x.x.x.vsix`. Install locally via:
```bash
code --install-extension flutter-net-inspector-*.vsix
```

---

## Dependencies

Runtime:
- `ws: ^8.16.0` — WebSocket server

Dev:
- `typescript`, `esbuild`, `@types/vscode`, `@types/ws`, `@types/node`, `prettier`
