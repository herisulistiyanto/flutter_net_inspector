import * as vscode from "vscode";
import { InspectorServer } from "./server";

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export class ActivityBarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "flutterNetInspectorView";

  private _view?: vscode.WebviewView;
  private _stateChangeDisposable?: vscode.Disposable;

  constructor(private readonly server: InspectorServer) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._buildHtml();

    // Rebuild HTML whenever the panel becomes visible again so persisted
    // config values are always reflected (resolveWebviewView is not
    // guaranteed to be called on every re-show).
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        webviewView.webview.html = this._buildHtml();
      }
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "startServer":
          await vscode.commands.executeCommand("flutterNetInspector.startServer");
          break;
        case "stopServer":
          await vscode.commands.executeCommand("flutterNetInspector.stopServer");
          break;
        case "openDashboard":
          await vscode.commands.executeCommand("flutterNetInspector.open");
          break;
        case "applySettings": {
          const host = (message.host as string).trim();
          const portNum = parseInt(message.port as string, 10);

          if (!host) {
            this._postApplyResult(false, "Host cannot be empty.");
            return;
          }
          if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
            this._postApplyResult(false, "Port must be between 1024 and 65535.");
            return;
          }

          try {
            const cfg = vscode.workspace.getConfiguration("flutterNetInspector");
            await cfg.update("host", host, vscode.ConfigurationTarget.Global);
            await cfg.update("port", portNum, vscode.ConfigurationTarget.Global);

            const wasRunning = this.server.isRunning;
            if (wasRunning) {
              await this.server.stop();
            }
            this.server.updateConfig(host, portNum);
            if (wasRunning) {
              await this.server.start();
            }

            this._postApplyResult(true, `Applied: ${host}:${portNum}`);
            vscode.window.showInformationMessage(
              `Net Inspector settings applied — ${host}:${portNum}`
            );
          } catch (e) {
            const msg = (e as Error).message ?? String(e);
            this._postApplyResult(false, `Failed to apply: ${msg}`);
            vscode.window.showErrorMessage(`Net Inspector: failed to apply settings — ${msg}`);
          }
          break;
        }
      }
    });

    this._stateChangeDisposable?.dispose();
    this._stateChangeDisposable = this.server.onStateChange(() => this._postState());
  }

  private _postState() {
    this._view?.webview.postMessage({
      type: "stateUpdate",
      running: this.server.isRunning,
      clients: this.server.connectedClients,
      host: this.server.host,
      port: this.server.port,
    });
  }

  private _postApplyResult(success: boolean, message: string) {
    this._view?.webview.postMessage({ type: "applyResult", success, message });
  }

  private _buildHtml(): string {
    const nonce = getNonce();
    const running = this.server.isRunning;
    const clients = this.server.connectedClients;
    // Read from persisted config so values survive panel close/reopen
    const cfg = vscode.workspace.getConfiguration("flutterNetInspector");
    const host = cfg.get<string>("host", "127.0.0.1");
    const port = cfg.get<number>("port", 9555);
    const fieldsDisabled = running ? "disabled" : "";

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 10px 8px 16px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
    }

    /* ── Status row ── */
    .status-row {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 10px;
    }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background 0.3s;
    }
    .dot.on  { background: #4ec9b0; }
    .dot.off { background: var(--vscode-disabledForeground, #6b6b6b); }
    #statusText { font-size: 12px; }

    /* ── Button row ── */
    .btn-row {
      display: flex;
      gap: 5px;
      margin-bottom: 10px;
    }
    button {
      flex: 1;
      padding: 4px 6px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      cursor: pointer;
      border: none;
      border-radius: 2px;
      line-height: 1.4;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    button:disabled { opacity: 0.5; cursor: default; }

    /* ── Divider ── */
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
      margin: 10px 0;
    }

    /* ── Form fields ── */
    .field { margin-bottom: 8px; }
    label {
      display: block;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 3px;
    }
    input {
      width: 100%;
      padding: 4px 6px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      outline: none;
      transition: opacity 0.2s;
    }
    input:focus:not(:disabled) { border-color: var(--vscode-focusBorder); }
    input:disabled { opacity: 0.45; cursor: not-allowed; }
    /* hide number spinners */
    input[type="number"] { -moz-appearance: textfield; }
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; }

    /* ── Hint / feedback row ── */
    .hint {
      font-size: 10px;
      margin: 4px 0 6px;
      min-height: 14px;
      color: var(--vscode-descriptionForeground);
    }
    .hint.ok  { color: #4ec9b0; }
    .hint.err { color: var(--vscode-errorForeground, #f48771); }

    #applyBtn { width: 100%; }
  </style>
</head>
<body>

  <div class="status-row">
    <span class="dot ${running ? "on" : "off"}" id="dot"></span>
    <span id="statusText">${
      running
        ? `Running &middot; ${clients} app${clients !== 1 ? "s" : ""}`
        : "Stopped"
    }</span>
  </div>

  <div class="btn-row">
    <button class="btn-primary" id="toggleBtn">${running ? "Stop Server" : "Start Server"}</button>
    <button class="btn-secondary" id="dashboardBtn">Dashboard</button>
  </div>

  <hr class="divider">

  <div class="field">
    <label>Host</label>
    <input type="text" id="hostInput" value="${host}" placeholder="127.0.0.1"
      spellcheck="false" ${fieldsDisabled}>
  </div>
  <div class="field">
    <label>Port</label>
    <input type="number" id="portInput" value="${port}" placeholder="9555"
      min="1024" max="65535" ${fieldsDisabled}>
  </div>
  <p class="hint" id="hint">${running ? "Stop the server to edit settings." : ""}</p>
  <button class="btn-primary" id="applyBtn" disabled>Apply</button>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    let running = ${JSON.stringify(running)};
    let savedHost = ${JSON.stringify(String(host))};
    let savedPort = ${JSON.stringify(String(port))};
    let hintTimer = null;

    const dot         = document.getElementById('dot');
    const statusText  = document.getElementById('statusText');
    const toggleBtn   = document.getElementById('toggleBtn');
    const dashboardBtn= document.getElementById('dashboardBtn');
    const hostInput   = document.getElementById('hostInput');
    const portInput   = document.getElementById('portInput');
    const applyBtn    = document.getElementById('applyBtn');
    const hint        = document.getElementById('hint');

    function setFieldsLocked(locked) {
      hostInput.disabled = locked;
      portInput.disabled = locked;
    }

    function setHint(text, type /* 'ok' | 'err' | '' */, autoClear) {
      if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
      hint.textContent = text;
      hint.className = 'hint' + (type ? ' ' + type : '');
      if (autoClear) {
        hintTimer = setTimeout(() => {
          hint.textContent = '';
          hint.className = 'hint';
        }, 3000);
      }
    }

    function checkDirty() {
      if (running) {
        applyBtn.disabled = true;
        setHint('Stop the server to edit settings.', '', false);
        return;
      }
      const dirty = hostInput.value !== savedHost || portInput.value !== savedPort;
      applyBtn.disabled = !dirty;
      if (dirty) {
        setHint('Unsaved changes', '', false);
      } else {
        // don't overwrite an ok/err message that's still showing
        if (!hint.classList.contains('ok') && !hint.classList.contains('err')) {
          setHint('', '', false);
        }
      }
    }

    hostInput.addEventListener('input', checkDirty);
    portInput.addEventListener('input', checkDirty);

    toggleBtn.addEventListener('click', () => {
      vscode.postMessage({ command: running ? 'stopServer' : 'startServer' });
    });

    dashboardBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'openDashboard' });
    });

    applyBtn.addEventListener('click', () => {
      vscode.postMessage({
        command: 'applySettings',
        host: hostInput.value,
        port: portInput.value,
      });
    });

    window.addEventListener('message', ({ data }) => {
      if (data.type === 'stateUpdate') {
        running = data.running;
        const clients = data.clients;

        dot.className = 'dot ' + (running ? 'on' : 'off');
        statusText.innerHTML = running
          ? \`Running &middot; \${clients} app\${clients !== 1 ? 's' : ''}\`
          : 'Stopped';
        toggleBtn.textContent = running ? 'Stop Server' : 'Start Server';
        setFieldsLocked(running);

        // Sync saved baseline only when there are no pending edits
        if (applyBtn.disabled || running) {
          savedHost = String(data.host);
          savedPort = String(data.port);
          hostInput.value = savedHost;
          portInput.value = savedPort;
        }
        checkDirty();
      }

      if (data.type === 'applyResult') {
        if (data.success) {
          savedHost = hostInput.value.trim();
          savedPort = portInput.value;
          applyBtn.disabled = true;
          setHint(data.message, 'ok', true);
        } else {
          setHint(data.message, 'err', true);
        }
      }
    });
  </script>
</body>
</html>`;
  }
}
