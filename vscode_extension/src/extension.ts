import * as vscode from "vscode";
import { InspectorServer } from "./server";
import { InspectorPanel } from "./panel";
import { ActivityBarViewProvider } from "./activityBarProvider";

let server: InspectorServer | undefined;

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("flutterNetInspector");
  const host = config.get<string>("host", "127.0.0.1");
  const port = config.get<number>("port", 9555);
  const maxEntries = config.get<number>("maxEntries", 500);
  const autoStart = config.get<boolean>("autoStart", false);

  server = new InspectorServer(host, port, maxEntries);

  // Register Activity Bar webview panel
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ActivityBarViewProvider.viewType,
      new ActivityBarViewProvider(server)
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("flutterNetInspector.open", () => {
      if (!server) {
        return;
      }
      InspectorPanel.createOrShow(context.extensionUri, server);
    }),

    vscode.commands.registerCommand("flutterNetInspector.startServer", async () => {
      if (!server) {
        return;
      }
      try {
        await server.start();
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "EADDRINUSE") {
          vscode.window.showErrorMessage(
            `Port ${server.port} is already in use. Change it in the Net Inspector panel or settings.`
          );
        } else {
          vscode.window.showErrorMessage(`Failed to start server: ${e}`);
        }
      }
    }),

    vscode.commands.registerCommand("flutterNetInspector.stopServer", async () => {
      if (!server) {
        return;
      }
      await server.stop();
      vscode.window.showInformationMessage("Net Inspector server stopped");
    }),

    vscode.commands.registerCommand("flutterNetInspector.clearTraffic", () => {
      server?.clearEntries();
      vscode.window.showInformationMessage("Network traffic cleared");
    })
  );

  // Auto-start if configured — silently ignore port conflicts
  if (autoStart) {
    server.start().catch((e) => {
      console.error("[NetInspector] Auto-start failed:", e);
      if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        vscode.window.showErrorMessage(`Net Inspector failed to start: ${e?.message ?? e}`);
      }
    });
  }

  context.subscriptions.push({
    dispose: () => server?.dispose(),
  });
}

export function deactivate() {
  server?.dispose();
}
