import * as vscode from 'vscode';
import { InspectorServer } from './server';
import { InspectorPanel } from './panel';

let server: InspectorServer | undefined;

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('flutterNetInspector');
  const port = config.get<number>('port', 9555);
  const maxEntries = config.get<number>('maxEntries', 500);
  const autoStart = config.get<boolean>('autoStart', true);

  server = new InspectorServer(port, maxEntries);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('flutterNetInspector.open', () => {
      if (!server) { return; }
      // Ensure server is running
      if (!server.isRunning) {
        server.start().then(() => {
          InspectorPanel.createOrShow(context.extensionUri, server!);
        });
      } else {
        InspectorPanel.createOrShow(context.extensionUri, server);
      }
    }),

    vscode.commands.registerCommand('flutterNetInspector.startServer', async () => {
      if (!server) { return; }
      try {
        await server.start();
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to start server: ${e}`);
      }
    }),

    vscode.commands.registerCommand('flutterNetInspector.stopServer', async () => {
      if (!server) { return; }
      await server.stop();
      vscode.window.showInformationMessage('Net Inspector server stopped');
    }),

    vscode.commands.registerCommand('flutterNetInspector.clearTraffic', () => {
      server?.clearEntries();
      vscode.window.showInformationMessage('Network traffic cleared');
    }),
  );

  // Auto-start server if configured
  if (autoStart) {
    server.start().catch((e) => {
      console.error('[NetInspector] Auto-start failed:', e);
    });
  }

  context.subscriptions.push({
    dispose: () => server?.dispose(),
  });
}

export function deactivate() {
  server?.dispose();
}
