import 'dart:async';
import 'dart:developer' as developer;

import 'package:dio/dio.dart';

import 'inspector_client.dart';
import 'mock_store.dart';
import 'models.dart';

/// Dio interceptor that captures all network traffic and enables
/// real-time mocking/modification via a connected VSCode extension.
///
/// Two interception modes:
///   1. **mockBeforeRequest** — matched requests never hit the server;
///      a mock response is returned immediately.
///   2. **breakpoint** — the real request goes through, but the response
///      is paused until VSCode sends back an edited version (or resumes).
///
/// Usage:
/// ```dart
/// final inspector = NetInspectorInterceptor();
/// await inspector.connect(); // connects to VSCode extension
/// dio.interceptors.add(inspector);
/// ```
class NetInspectorInterceptor extends Interceptor {
  final InspectorClient _client;
  final MockRuleStore _mockStore;
  final Duration breakpointTimeout;

  /// Pending breakpoint completers, keyed by request ID.
  /// When a response is paused (breakpoint mode), a Completer is created
  /// and awaited. VSCode sends either `modify_response` or `resume_response`
  /// to complete it.
  final Map<String, Completer<MockResponseData?>> _pendingBreakpoints = {};

  /// Track request start times for duration calculation
  final Map<String, DateTime> _requestTimings = {};

  /// Reference to the Dio instance for request replay
  Dio? _dio;

  /// Auto-incrementing request ID
  int _requestCounter = 0;

  bool get isConnected => _client.isConnected;

  NetInspectorInterceptor({
    String host = '127.0.0.1',
    int port = 9555,
    this.breakpointTimeout = const Duration(seconds: 30),
    InspectorClient? client,
  })  : _client = client ??
            InspectorClient(
              host: host,
              port: port,
            ),
        _mockStore = MockRuleStore() {
    // Listen for commands from VSCode
    _client.messages.listen(_handleVSCodeMessage);
  }

  /// Attach a Dio instance for request replay support.
  /// Call this after adding the interceptor to Dio.
  ///
  /// ```dart
  /// dio.interceptors.add(inspector);
  /// inspector.attachDio(dio);
  /// ```
  void attachDio(Dio dio) {
    _dio = dio;
  }

  /// Connect to the VSCode extension
  Future<void> connect() => _client.connect();

  /// Disconnect and clean up
  Future<void> dispose() async {
    // Complete all pending breakpoints so they don't hang forever
    for (final completer in _pendingBreakpoints.values) {
      if (!completer.isCompleted) {
        completer.complete(null); // resume with original
      }
    }
    _pendingBreakpoints.clear();
    _requestTimings.clear();
    await _client.dispose();
  }

  // ---------------------------------------------------------------------------
  // Dio Interceptor overrides
  // ---------------------------------------------------------------------------

  @override
  void onRequest(
      RequestOptions options, RequestInterceptorHandler handler) {
    final requestId = _nextRequestId();
    // Tag the request so we can correlate it later
    options.extra['_inspector_id'] = requestId;
    _requestTimings[requestId] = DateTime.now();

    final url = options.uri.toString();
    final method = options.method;

    // Send captured request to VSCode
    final captured = CapturedRequest(
      id: requestId,
      method: method,
      url: url,
      headers: options.headers.map((k, v) => MapEntry(k, v.toString())),
      body: options.data,
      queryParameters:
          options.queryParameters.map((k, v) => MapEntry(k, v.toString())),
    );
    _client.sendRequest(captured.toMap());

    // Check for mock rules
    final rule = _mockStore.findMatch(url, method);

    if (rule != null && rule.action == MockRuleAction.mockBeforeRequest) {
      // Mode 1: Return mock immediately without hitting the server
      _log('MOCK: $method $url');

      final mock = rule.mockResponse;
      if (mock == null) {
        handler.next(options);
        return;
      }

      // Simulate delay if configured
      if (mock.delayMs != null && mock.delayMs! > 0) {
        Future.delayed(Duration(milliseconds: mock.delayMs!), () {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: mock.statusCode,
              headers: Headers.fromMap(
                mock.headers.map((k, v) => MapEntry(k, [v.toString()])),
              ),
              data: _parseResponseBody(mock.body),
            ),
            true, // call resolveCallbackFilter
          );
        });
      } else {
        handler.resolve(
          Response(
            requestOptions: options,
            statusCode: mock.statusCode,
            headers: Headers.fromMap(
              mock.headers.map((k, v) => MapEntry(k, [v.toString()])),
            ),
            data: _parseResponseBody(mock.body),
          ),
          true,
        );
      }

      // Also notify VSCode that this was mocked
      _client.sendResponse({
        'requestId': requestId,
        'statusCode': mock.statusCode,
        'headers': mock.headers,
        'body': mock.body,
        'durationMs': mock.delayMs ?? 0,
        'mocked': true,
      });

      return;
    }

    // No mock rule or breakpoint-type rule → proceed normally
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) async {
    final requestId =
        response.requestOptions.extra['_inspector_id'] as String?;
    if (requestId == null) {
      handler.next(response);
      return;
    }

    final startTime = _requestTimings.remove(requestId);
    final durationMs = startTime != null
        ? DateTime.now().difference(startTime).inMilliseconds
        : 0;

    final url = response.requestOptions.uri.toString();
    final method = response.requestOptions.method;

    // Send captured response to VSCode
    final captured = CapturedResponse(
      requestId: requestId,
      statusCode: response.statusCode ?? 200,
      headers: _flattenHeaders(response.headers),
      body: response.data,
      durationMs: durationMs,
    );
    _client.sendResponse(captured.toMap());

    // Check if this request has a breakpoint rule
    final rule = _mockStore.findMatch(url, method);
    if (rule != null && rule.action == MockRuleAction.breakpoint) {
      _log('BREAKPOINT: pausing response for $method $url');

      // Create a completer and wait for VSCode to respond
      final completer = Completer<MockResponseData?>();
      _pendingBreakpoints[requestId] = completer;

      // Notify VSCode that this response is paused
      _client.send(InspectorMessage(
        type: MessageType.response_captured,
        id: requestId,
        payload: {
          ...captured.toMap(),
          'breakpoint': true, // tells VSCode UI to highlight this
        },
      ));

      try {
        // Wait for VSCode to send back modified response or resume
        final modified = await completer.future.timeout(breakpointTimeout);
        _pendingBreakpoints.remove(requestId);

        if (modified != null) {
          // VSCode sent back a modified response
          _log('MODIFIED: $method $url → ${modified.statusCode}');
          handler.resolve(Response(
            requestOptions: response.requestOptions,
            statusCode: modified.statusCode,
            headers: Headers.fromMap(
              modified.headers.map((k, v) => MapEntry(k, [v.toString()])),
            ),
            data: _parseResponseBody(modified.body),
          ));
          return;
        }
      } on TimeoutException {
        _log('BREAKPOINT TIMEOUT: resuming original response for $url');
        _pendingBreakpoints.remove(requestId);
      }
    }

    // Pass through original response
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final requestId = err.requestOptions.extra['_inspector_id'] as String?;
    if (requestId != null) {
      final startTime = _requestTimings.remove(requestId);
      final durationMs = startTime != null
          ? DateTime.now().difference(startTime).inMilliseconds
          : 0;

      _client.sendError(requestId, {
        'requestId': requestId,
        'type': err.type.name,
        'message': err.message ?? 'Unknown error',
        'statusCode': err.response?.statusCode,
        'url': err.requestOptions.uri.toString(),
        'durationMs': durationMs,
      });
    }

    handler.next(err);
  }

  // ---------------------------------------------------------------------------
  // Handle messages coming FROM VSCode
  // ---------------------------------------------------------------------------

  void _handleVSCodeMessage(InspectorMessage message) {
    switch (message.type) {
      case MessageType.mock_rule_add:
        final rule = MockRule.fromMap(message.payload);
        _mockStore.addRule(rule);

      case MessageType.mock_rule_remove:
        _mockStore.removeRule(message.payload['ruleId'] as String);

      case MessageType.mock_rule_update:
        final rule = MockRule.fromMap(message.payload);
        _mockStore.updateRule(rule);

      case MessageType.mock_rule_clear:
        _mockStore.clearRules();

      case MessageType.modify_response:
        // VSCode edited a breakpointed response
        final requestId = message.payload['requestId'] as String;
        final completer = _pendingBreakpoints[requestId];
        if (completer != null && !completer.isCompleted) {
          completer.complete(MockResponseData.fromMap(message.payload));
        }

      case MessageType.resume_response:
        // VSCode says "let it through unchanged"
        final requestId = message.payload['requestId'] as String;
        final completer = _pendingBreakpoints[requestId];
        if (completer != null && !completer.isCompleted) {
          completer.complete(null);
        }

      case MessageType.replay_request:
        // VSCode wants to re-fire a captured request
        _replayRequest(message.payload);

      default:
        _log('Unhandled message type: ${message.type}');
    }
  }

  // ---------------------------------------------------------------------------
  // Request replay
  // ---------------------------------------------------------------------------

  /// Re-send a previously captured request through the attached Dio instance.
  Future<void> _replayRequest(Map<String, dynamic> payload) async {
    if (_dio == null) {
      _log('REPLAY: No Dio instance attached. Call attachDio() first.');
      return;
    }

    final method = payload['method'] as String? ?? 'GET';
    final url = payload['url'] as String?;
    if (url == null) {
      _log('REPLAY: No URL provided');
      return;
    }

    final headers = Map<String, dynamic>.from(
      payload['headers'] as Map<String, dynamic>? ?? {},
    );
    final body = payload['body'];

    _log('REPLAY: $method $url');

    try {
      await _dio!.request(
        url,
        data: body,
        options: Options(
          method: method,
          headers: headers,
        ),
      );
    } catch (e) {
      _log('REPLAY error: $e');
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  String _nextRequestId() => 'req_${++_requestCounter}';

  Map<String, dynamic> _flattenHeaders(Headers headers) {
    final map = <String, dynamic>{};
    headers.forEach((name, values) {
      map[name] = values.length == 1 ? values.first : values;
    });
    return map;
  }

  dynamic _parseResponseBody(dynamic body) {
    if (body is String) {
      try {
        return _tryJsonDecode(body);
      } catch (_) {
        return body;
      }
    }
    return body;
  }

  dynamic _tryJsonDecode(String str) {
    try {
      return str.isEmpty ? null : str;
    } catch (_) {
      return str;
    }
  }

  void _log(String msg) {
    developer.log(msg, name: 'NetInspector');
  }
}
