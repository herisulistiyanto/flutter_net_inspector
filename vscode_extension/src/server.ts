import * as vscode from "vscode";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";

export interface NetworkEntry {
  id: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  queryParameters: Record<string, string>;
  requestTimestamp: string;
  // Response (filled when response arrives)
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  durationMs?: number;
  mocked?: boolean;
  breakpoint?: boolean;
  // Error (filled if request fails)
  error?: {
    type: string;
    message: string;
  };
}

type MessageHandler = (type: string, payload: Record<string, unknown>) => void;

export class InspectorServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;
  private entries: Map<string, NetworkEntry> = new Map();
  private maxEntries: number;
  private onMessage: MessageHandler | null = null;
  private statusBarItem: vscode.StatusBarItem;

  constructor(port: number = 9555, maxEntries: number = 500) {
    this.port = port;
    this.maxEntries = maxEntries;
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.updateStatusBar(false);
  }

  /**
   * Register a callback for messages from the Flutter app.
   * The panel uses this to receive live updates.
   */
  setMessageHandler(handler: MessageHandler) {
    this.onMessage = handler;
  }

  /**
   * Start the WebSocket server.
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.wss) {
        resolve();
        return;
      }

      try {
        this.wss = new WebSocketServer({ port: this.port });

        this.wss.on("listening", () => {
          this.updateStatusBar(true);
          vscode.window.showInformationMessage(`Net Inspector server running on port ${this.port}`);
          resolve();
        });

        this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
          this.clients.add(ws);
          this.updateStatusBar(true);
          console.log(`[NetInspector] Client connected from ${req.socket.remoteAddress}`);

          ws.on("message", (data: Buffer) => {
            try {
              const message = JSON.parse(data.toString());
              this.handleFlutterMessage(message);
            } catch (e) {
              console.error("[NetInspector] Invalid message:", e);
            }
          });

          ws.on("close", () => {
            this.clients.delete(ws);
            this.updateStatusBar(true);
            console.log("[NetInspector] Client disconnected");
          });

          ws.on("error", (err: Error) => {
            console.error("[NetInspector] Client error:", err.message);
            this.clients.delete(ws);
          });
        });

        this.wss.on("error", (err: Error) => {
          if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
            vscode.window.showErrorMessage(
              `Port ${this.port} is already in use. Change it in settings.`
            );
          }
          reject(err);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Stop the WebSocket server.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      // Close all client connections
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();

      this.wss.close(() => {
        this.wss = null;
        this.updateStatusBar(false);
        resolve();
      });
    });
  }

  /**
   * Send a message to all connected Flutter apps.
   * Used for pushing mock rules and response modifications.
   */
  broadcast(message: Record<string, unknown>) {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Send a mock rule to Flutter apps.
   */
  addMockRule(rule: Record<string, unknown>) {
    this.broadcast({
      type: "mock_rule_add",
      id: rule["id"] || `rule_${Date.now()}`,
      payload: rule,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Remove a mock rule.
   */
  removeMockRule(ruleId: string) {
    this.broadcast({
      type: "mock_rule_remove",
      id: ruleId,
      payload: { ruleId },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send modified response data back to a breakpointed request.
   */
  modifyResponse(requestId: string, responseData: Record<string, unknown>) {
    this.broadcast({
      type: "modify_response",
      id: requestId,
      payload: {
        requestId,
        ...responseData,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Resume a breakpointed request with its original response.
   */
  resumeResponse(requestId: string) {
    this.broadcast({
      type: "resume_response",
      id: requestId,
      payload: { requestId },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Ask Flutter app to replay a previously captured request.
   */
  replayRequest(requestData: Record<string, unknown>) {
    this.broadcast({
      type: "replay_request",
      id: `replay_${Date.now()}`,
      payload: requestData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get all captured entries.
   */
  getEntries(): NetworkEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Clear all captured traffic.
   */
  clearEntries() {
    this.entries.clear();
  }

  get isRunning(): boolean {
    return this.wss !== null;
  }

  get connectedClients(): number {
    return this.clients.size;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private handleFlutterMessage(message: {
    type: string;
    id: string;
    payload: Record<string, unknown>;
  }) {
    const { type, id, payload } = message;

    switch (type) {
      case "request_captured": {
        // Enforce max entries
        if (this.entries.size >= this.maxEntries) {
          const firstKey = this.entries.keys().next().value;
          if (firstKey) {
            this.entries.delete(firstKey);
          }
        }

        const entry: NetworkEntry = {
          id: payload["id"] as string,
          method: payload["method"] as string,
          url: payload["url"] as string,
          requestHeaders: (payload["headers"] as Record<string, string>) || {},
          requestBody: payload["body"],
          queryParameters: (payload["queryParameters"] as Record<string, string>) || {},
          requestTimestamp: (payload["timestamp"] as string) || new Date().toISOString(),
        };
        this.entries.set(entry.id, entry);
        break;
      }

      case "response_captured": {
        const requestId = payload["requestId"] as string;
        const entry = this.entries.get(requestId);
        if (entry) {
          entry.statusCode = payload["statusCode"] as number;
          entry.responseHeaders = payload["headers"] as Record<string, string>;
          entry.responseBody = payload["body"];
          entry.durationMs = payload["durationMs"] as number;
          entry.mocked = (payload["mocked"] as boolean) || false;
          entry.breakpoint = (payload["breakpoint"] as boolean) || false;
        }
        break;
      }

      case "error_captured": {
        const reqId = payload["requestId"] as string;
        const entry = this.entries.get(reqId);
        if (entry) {
          entry.statusCode = payload["statusCode"] as number | undefined;
          entry.durationMs = payload["durationMs"] as number;
          entry.error = {
            type: payload["type"] as string,
            message: payload["message"] as string,
          };
        }
        break;
      }

      case "app_connected":
        console.log(`[NetInspector] App handshake: ${JSON.stringify(payload)}`);
        break;

      case "app_disconnected":
        console.log("[NetInspector] App disconnected gracefully");
        break;
    }

    // Forward to the WebView panel
    this.onMessage?.(type, payload);
  }

  private updateStatusBar(running: boolean) {
    if (running) {
      const count = this.clients.size;
      this.statusBarItem.text = `$(globe) Inspector: ${count} app${count !== 1 ? "s" : ""}`;
      this.statusBarItem.tooltip = `Net Inspector running on port ${this.port}`;
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = "$(globe) Inspector: off";
      this.statusBarItem.tooltip = "Click to start Net Inspector";
    }
    this.statusBarItem.command = "flutterNetInspector.open";
    this.statusBarItem.show();
  }

  dispose() {
    this.stop();
    this.statusBarItem.dispose();
  }
}
