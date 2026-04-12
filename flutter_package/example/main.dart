import 'package:dio/dio.dart';
import 'package:flutter_net_inspector/flutter_net_inspector.dart';

/// Example: integrating the network inspector with your Dio setup.
///
/// In a real app using get_it/injectable, register this as a singleton
/// and add to your Dio instance in the injection module.
Future<void> main() async {
  // 1. Create the interceptor (only in debug mode!)
  final inspector = NetInspectorInterceptor(
    host: '127.0.0.1', // localhost for emulator
    port: 9555, // must match VSCode extension
    breakpointTimeout: const Duration(seconds: 30),
  );

  // 2. Connect to the VSCode extension
  //    This is non-blocking — if VSCode isn't running, it retries silently.
  await inspector.connect();

  // 3. Add to your Dio instance
  final dio = Dio(BaseOptions(
    baseUrl: 'https://api.example.com',
  ));

  // Add inspector FIRST so it captures everything
  dio.interceptors.add(inspector);
  // ... add your auth interceptor, logging, etc. after

  // 4. Attach Dio for request replay support (optional but recommended)
  inspector.attachDio(dio);

  // 5. Use Dio normally — all requests are now visible in VSCode!
  try {
    final response = await dio.get('/users');
    print('Got ${response.data}');
  } catch (e) {
    print('Error: $e');
  }

  // 5. Clean up when app closes
  await inspector.dispose();
}

// ---------------------------------------------------------------------------
// Integration with get_it / injectable (your typical setup)
// ---------------------------------------------------------------------------
//
// @module
// abstract class NetworkModule {
//   @singleton
//   NetInspectorInterceptor get inspector => NetInspectorInterceptor();
//
//   @singleton
//   Dio dio(NetInspectorInterceptor inspector) {
//     final dio = Dio(BaseOptions(baseUrl: Env.apiBaseUrl));
//     if (kDebugMode) {
//       dio.interceptors.insert(0, inspector);
//       inspector.attachDio(dio); // enables request replay from VSCode
//     }
//     return dio;
//   }
// }
//
// // In your app startup (e.g., main.dart or AppBloc):
// Future<void> initApp() async {
//   configureDependencies();
//   if (kDebugMode) {
//     await getIt<NetInspectorInterceptor>().connect();
//   }
// }
