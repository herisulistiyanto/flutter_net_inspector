import 'dart:io';

/// Global configuration for the Flutter Net Inspector.
///
/// Set values **before** [NetInspectorInterceptor] is constructed
/// (i.e., before your DI graph is built, typically at the top of `main()`).
///
/// ## Default host resolution order
/// 1. `--dart-define=INSPECTOR_HOST=<value>` at build/run time
/// 2. `10.0.2.2` on Android (standard emulator → host-machine alias)
/// 3. `127.0.0.1` everywhere else (iOS Simulator, macOS, etc.)
///
/// ## Real device setup
/// Real devices cannot reach the host machine via loopback or the emulator
/// alias. Find your machine's LAN IP (`ifconfig` / `ipconfig`) and either:
///
/// **Option A — dart-define (recommended for teams):**
/// ```
/// flutter run --dart-define=INSPECTOR_HOST=192.168.1.42
/// ```
/// Add this to your IDE launch configuration so each developer sets their
/// own IP without touching shared code.
///
/// **Option B — runtime assignment in `main()`:**
/// ```dart
/// void main() {
///   NetInspectorConfig.host = '192.168.1.42';
///   // … DI setup, runApp, etc.
/// }
/// ```
///
/// **Option C — keep it in DI (unchanged):**
/// ```dart
/// @singleton
/// NetInspectorInterceptor provideNetInspectorInterceptor() {
///   return NetInspectorInterceptor(); // picks up NetInspectorConfig automatically
/// }
/// ```
class NetInspectorConfig {
  NetInspectorConfig._();

  /// Host of the VSCode extension's WebSocket server.
  ///
  /// Resolved once at startup (see class-level doc for the resolution order).
  /// Override at runtime before the interceptor is created if needed.
  static String host = _resolveHost();

  /// Port of the VSCode extension's WebSocket server.
  ///
  /// Can be overridden via `--dart-define=INSPECTOR_PORT=<value>`.
  static int port = int.fromEnvironment('INSPECTOR_PORT', defaultValue: 9555);

  static String _resolveHost() {
    const envHost = String.fromEnvironment('INSPECTOR_HOST');
    if (envHost.isNotEmpty) return envHost;
    // Android emulator routes 10.0.2.2 to the host machine's loopback.
    // Real Android devices need an explicit LAN IP set via dart-define or
    // NetInspectorConfig.host = '...' in main().
    return Platform.isAndroid ? '10.0.2.2' : '127.0.0.1';
  }
}
