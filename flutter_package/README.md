# flutter_net_inspector

A Dio interceptor that captures your Flutter app's HTTP traffic and streams it live to the **Flutter Net Inspector** VSCode extension — with support for mocking responses, setting breakpoints, and replaying requests, all without touching your app code.

Think of it as **Flipper/Stetho for Flutter**, but the dashboard lives inside VSCode.

> The package is safe to leave wired up permanently. When no extension is connected, all requests pass through normally with zero overhead.

---

## Installation

```yaml
dependencies:
  flutter_net_inspector: ^0.1.0
```

---

## Setup

### Step 1 — Add the interceptor to Dio

Wrap your `Dio` instance with `NetInspectorInterceptor` in debug mode only:

```dart
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_net_inspector/flutter_net_inspector.dart';

final dio = Dio(BaseOptions(baseUrl: 'https://api.example.com'));

if (kDebugMode) {
  final inspector = NetInspectorInterceptor();
  dio.interceptors.insert(0, inspector); // must be first
  inspector.attachDio(dio);              // enables request replay
}
```

### Step 2 — Connect

Call `connect()` once after your app initialises (e.g. in `main()` or after your DI container is ready):

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (kDebugMode) {
    await inspector.connect();
  }

  runApp(const MyApp());
}
```

The client connects in the background and auto-reconnects silently if the extension is not yet running.

---

## Host configuration

The interceptor needs to reach the WebSocket server run by the VSCode extension (default port **9555**). The correct host depends on how you run your app:

| Device | Default host | Notes |
|---|---|---|
| iOS Simulator | `127.0.0.1` | Works out of the box |
| Android Emulator | `10.0.2.2` | Emulator's alias for the host machine |
| Android Real Device | — | Set your machine's LAN IP, or use `adb reverse` |
| iOS Real Device | — | Set your machine's LAN IP |

### Override the host

**Option A — `--dart-define` (recommended for teams)**

Add to your IDE launch configuration so no shared code changes:

```jsonc
// .vscode/launch.json
{
  "configurations": [
    {
      "name": "Flutter (debug)",
      "type": "dart",
      "request": "launch",
      "args": ["--dart-define=INSPECTOR_HOST=192.168.1.42"]
    }
  ]
}
```

Or from the terminal:

```bash
flutter run --dart-define=INSPECTOR_HOST=192.168.1.42
```

**Option B — set it in code**

```dart
NetInspectorConfig.host = '192.168.1.42'; // set before constructing the interceptor
```

**Option C — `adb reverse` (Android real device, no IP needed)**

```bash
adb reverse tcp:9555 tcp:9555
# host remains 127.0.0.1
```

### Override the port

```dart
NetInspectorConfig.port = 9555; // default; change if the extension uses a different port
```

Or via `--dart-define`:

```bash
flutter run --dart-define=INSPECTOR_PORT=9555
```

---

## Using with a DI container (get_it / injectable)

```dart
@module
abstract class NetworkModule {
  @singleton
  NetInspectorInterceptor get inspector => NetInspectorInterceptor();

  @singleton
  Dio dio(NetInspectorInterceptor inspector) {
    final dio = Dio(BaseOptions(baseUrl: Env.apiBaseUrl));
    if (kDebugMode) {
      dio.interceptors.insert(0, inspector);
      inspector.attachDio(dio);
    }
    return dio;
  }
}

// In main(), after getIt is ready:
if (kDebugMode) {
  await getIt<NetInspectorInterceptor>().connect();
}
```

---

## What you get in the VSCode dashboard

- **Live traffic** — every request and response, with headers, body, status, and timing
- **Mock responses** — intercept any URL and return a custom status, headers, and body
- **Breakpoints** — pause a response mid-flight, inspect and edit it, then resume
- **Replay** — re-fire any captured request with one click
- **Filters** — filter by URL, method, or status code; dedicated views for mocked and errored requests

---

## Screenshots

**Step 1 — Capture traffic and open the context menu**

Click the three-dots icon on any captured request to mock it, replay it, or copy it as a cURL command.

![Captured traffic with context menu](https://raw.githubusercontent.com/herisulistiyanto/flutter_net_inspector/main/flutter_package/images/showcase_1.png)

**Step 2 — Configure the mock response**

The mock editor opens pre-filled with the request's URL, method, status code, and response body. Change only what you need.

![Mock editor pre-filled from request](https://raw.githubusercontent.com/herisulistiyanto/flutter_net_inspector/main/flutter_package/images/showcase_2.png)

**Step 3 — Mock active**

The request is now intercepted. The row is highlighted, the detail panel shows the mocked response body, and your Flutter app receives the mock data.

![Mock active in dashboard and app](https://raw.githubusercontent.com/herisulistiyanto/flutter_net_inspector/main/flutter_package/images/showcase_3.png)

---

## Companion

This package requires the **Flutter Net Inspector** VSCode extension to display the dashboard.
Install it from the VS Code Marketplace or from open-vsx.
