import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { InspectorServer, NetworkEntry } from "./server";

const RULES_FILENAME = "net-inspector-rules.json";

export class InspectorPanel {
  public static currentPanel: InspectorPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly server: InspectorServer;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    server: InspectorServer
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.server = server;

    this.panel.webview.html = this.loadWebViewHtml();

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleWebViewMessage(message),
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Forward network events from server to WebView
    this.server.setMessageHandler((type, payload) => {
      this.panel.webview.postMessage({ type, payload });
    });

    this.sendInitialData();
    this.loadPersistedRules();
  }

  static createOrShow(extensionUri: vscode.Uri, server: InspectorServer) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (InspectorPanel.currentPanel) {
      InspectorPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "flutterNetInspector",
      "Net Inspector",
      column || vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "webview")],
      }
    );

    InspectorPanel.currentPanel = new InspectorPanel(panel, extensionUri, server);
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  private sendInitialData() {
    this.panel.webview.postMessage({
      type: "initial_data",
      payload: {
        entries: this.server.getEntries(),
        serverRunning: this.server.isRunning,
        connectedClients: this.server.connectedClients,
      },
    });
  }

  private loadPersistedRules() {
    const rulesPath = this.getRulesFilePath();
    if (!rulesPath) {
      return;
    }

    try {
      if (fs.existsSync(rulesPath)) {
        const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
        if (Array.isArray(rules)) {
          this.panel.webview.postMessage({
            type: "load_persisted_rules",
            payload: { rules },
          });
          for (const rule of rules) {
            if (rule.enabled !== false) {
              this.server.addMockRule(rule);
            }
          }
        }
      }
    } catch (e) {
      console.error("[NetInspector] Failed to load persisted rules:", e);
    }
  }

  private persistRules(rules: unknown[]) {
    const rulesPath = this.getRulesFilePath();
    if (!rulesPath) {
      return;
    }

    try {
      const dir = path.dirname(rulesPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), "utf8");
    } catch (e) {
      console.error("[NetInspector] Failed to persist rules:", e);
    }
  }

  private getRulesFilePath(): string | null {
    const wf = vscode.workspace.workspaceFolders;
    if (!wf || wf.length === 0) {
      return null;
    }
    return path.join(wf[0].uri.fsPath, ".vscode", RULES_FILENAME);
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  private handleWebViewMessage(message: { command: string; data?: Record<string, unknown> }) {
    switch (message.command) {
      case "addMockRule":
        if (message.data) {
          this.server.addMockRule(message.data);
        }
        break;

      case "removeMockRule":
        if (message.data?.["ruleId"]) {
          this.server.removeMockRule(message.data["ruleId"] as string);
        }
        break;

      case "modifyResponse":
        if (message.data?.["requestId"]) {
          this.server.modifyResponse(
            message.data["requestId"] as string,
            message.data as Record<string, unknown>
          );
        }
        break;

      case "resumeResponse":
        if (message.data?.["requestId"]) {
          this.server.resumeResponse(message.data["requestId"] as string);
        }
        break;

      case "clearTraffic":
        this.server.clearEntries();
        break;

      case "getEntries":
        this.sendInitialData();
        break;

      case "persistRules":
        if (Array.isArray(message.data?.["rules"])) {
          this.persistRules(message.data["rules"] as unknown[]);
        }
        break;

      case "replayRequest":
        if (message.data) {
          this.server.replayRequest(message.data);
        }
        break;

      case "exportHar":
        this.exportAsHar();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // HAR export
  // ---------------------------------------------------------------------------

  private async exportAsHar() {
    const entries = this.server.getEntries();
    const har = {
      log: {
        version: "1.2",
        creator: { name: "Flutter Net Inspector", version: "0.1.0" },
        entries: entries.map((e) => ({
          startedDateTime: e.requestTimestamp,
          time: e.durationMs ?? 0,
          request: {
            method: e.method,
            url: e.url,
            headers: Object.entries(e.requestHeaders || {}).map(([k, v]) => ({
              name: k,
              value: String(v),
            })),
            queryString: Object.entries(e.queryParameters || {}).map(([k, v]) => ({
              name: k,
              value: String(v),
            })),
            postData: e.requestBody
              ? {
                  mimeType: "application/json",
                  text:
                    typeof e.requestBody === "string"
                      ? e.requestBody
                      : JSON.stringify(e.requestBody),
                }
              : undefined,
          },
          response: {
            status: e.statusCode ?? 0,
            statusText: "",
            headers: Object.entries(e.responseHeaders || {}).map(([k, v]) => ({
              name: k,
              value: String(v),
            })),
            content: {
              size: -1,
              mimeType: "application/json",
              text:
                e.responseBody != null
                  ? typeof e.responseBody === "string"
                    ? e.responseBody
                    : JSON.stringify(e.responseBody)
                  : "",
            },
          },
          timings: { send: 0, wait: e.durationMs ?? 0, receive: 0 },
        })),
      },
    };

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file("network-traffic.har"),
      filters: { "HAR files": ["har"], JSON: ["json"] },
    });

    if (uri) {
      fs.writeFileSync(uri.fsPath, JSON.stringify(har, null, 2), "utf8");
      vscode.window.showInformationMessage(
        `Exported ${entries.length} entries to ${path.basename(uri.fsPath)}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // HTML loading
  // ---------------------------------------------------------------------------

  private loadWebViewHtml(): string {
    const htmlPath = path.join(this.extensionUri.fsPath, "webview", "index.html");
    const nonce = getNonce();
    let html: string;

    if (fs.existsSync(htmlPath)) {
      html = fs.readFileSync(htmlPath, "utf8");
    } else {
      html = `<!DOCTYPE html><html><body>
        <p>Could not load webview/index.html.</p></body></html>`;
    }

    return html
      .replace(/\{\{nonce\}\}/g, nonce)
      .replace(/\{\{cspSource\}\}/g, this.panel.webview.cspSource);
  }

  private dispose() {
    InspectorPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
