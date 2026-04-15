import 'package:dio/dio.dart';
import 'package:example/todo_response.dart';
import 'package:flutter_net_inspector/flutter_net_inspector.dart';

final class NetworkHelper {
  NetworkHelper._();

  static final instance = NetworkHelper._();
  late NetInspectorInterceptor inspector;
  late Dio dio;

  Future<void> init() async {
    inspector = NetInspectorInterceptor(
      host: '127.0.0.1',
      port: 9556,
    );

    /// connect to VSCode extension
    await inspector.connect();

    dio = Dio(
      BaseOptions(
        baseUrl: 'https://jsonplaceholder.typicode.com',
        headers: {
          'Content-Type': 'application/json',
        },
      ),
    )..interceptors.add(inspector);

    /// attach dio for request replay support
    inspector.attachDio(dio);
  }

  Future<void> disconnect() async {
    await inspector.dispose();
  }

  Future<String> getTodo() async {
    try {
      final response = await dio.get('/todos/1');
      final statusCode = response.statusCode ?? 0;
      if (statusCode >= 200 && statusCode < 300) {
        return TodoResponse.fromJson(response.data).title ?? '-';
      }
      return 'Unexpected status: $statusCode';
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode ?? 0;
      if (statusCode >= 400 && statusCode < 500) {
        return 'Client error ($statusCode)';
      } else if (statusCode >= 500 && statusCode < 600) {
        return 'Server error ($statusCode)';
      }
      return 'Error: ${e.message}';
    }
  }
}