// ignore_for_file: constant_identifier_names

import 'dart:convert';

/// All message types flowing between Flutter <-> VSCode
enum MessageType {
  // Flutter -> VSCode
  request_captured,
  response_captured,
  error_captured,
  app_connected,
  app_disconnected,

  // VSCode -> Flutter
  mock_rule_add,
  mock_rule_remove,
  mock_rule_update,
  mock_rule_clear,
  modify_response, // real-time response editing (breakpoint mode)
  resume_response, // resume paused response as-is
  replay_request, // re-send a captured request

  // Flutter -> VSCode (replay result)
  replay_result,
}

/// Wraps every WebSocket message
class InspectorMessage {
  final MessageType type;
  final String id;
  final Map<String, dynamic> payload;
  final DateTime timestamp;

  InspectorMessage({
    required this.type,
    required this.id,
    required this.payload,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  factory InspectorMessage.fromJson(String raw) {
    final map = jsonDecode(raw) as Map<String, dynamic>;
    return InspectorMessage(
      type: MessageType.values.byName(map['type'] as String),
      id: map['id'] as String,
      payload: map['payload'] as Map<String, dynamic>? ?? {},
      timestamp: DateTime.tryParse(map['timestamp'] as String? ?? '') ??
          DateTime.now(),
    );
  }

  String toJson() => jsonEncode({
        'type': type.name,
        'id': id,
        'payload': payload,
        'timestamp': timestamp.toIso8601String(),
      });
}

/// Captured network request data
class CapturedRequest {
  final String id;
  final String method;
  final String url;
  final Map<String, dynamic> headers;
  final dynamic body;
  final Map<String, dynamic> queryParameters;
  final DateTime timestamp;

  CapturedRequest({
    required this.id,
    required this.method,
    required this.url,
    required this.headers,
    this.body,
    this.queryParameters = const {},
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toMap() => {
        'id': id,
        'method': method,
        'url': url,
        'headers': headers,
        'body': _serializeBody(body),
        'queryParameters': queryParameters,
        'timestamp': timestamp.toIso8601String(),
      };
}

/// Captured network response data
class CapturedResponse {
  final String requestId;
  final int statusCode;
  final Map<String, dynamic> headers;
  final dynamic body;
  final int durationMs;

  CapturedResponse({
    required this.requestId,
    required this.statusCode,
    required this.headers,
    this.body,
    required this.durationMs,
  });

  Map<String, dynamic> toMap() => {
        'requestId': requestId,
        'statusCode': statusCode,
        'headers': headers,
        'body': _serializeBody(body),
        'durationMs': durationMs,
      };
}

/// A mock rule pushed from VSCode to intercept matching requests
class MockRule {
  final String id;
  final String urlPattern; // exact URL string match
  final String? method; // null = match all methods
  final bool enabled;
  final MockRuleAction action;
  final MockResponseData? mockResponse;

  MockRule({
    required this.id,
    required this.urlPattern,
    this.method,
    this.enabled = true,
    this.action = MockRuleAction.mockBeforeRequest,
    this.mockResponse,
  });

  factory MockRule.fromMap(Map<String, dynamic> map) => MockRule(
        id: map['id'] as String,
        urlPattern: map['urlPattern'] as String,
        method: map['method'] as String?,
        enabled: map['enabled'] as bool? ?? true,
        action: MockRuleAction.values.byName(
          map['action'] as String? ?? 'mockBeforeRequest',
        ),
        mockResponse: map['mockResponse'] != null
            ? MockResponseData.fromMap(
                map['mockResponse'] as Map<String, dynamic>)
            : null,
      );

  /// Check if this rule matches a given request (exact URL comparison)
  bool matches(String url, String requestMethod) {
    if (!enabled) return false;
    if (method != null &&
        method!.toUpperCase() != requestMethod.toUpperCase()) {
      return false;
    }
    return urlPattern == url;
  }
}

enum MockRuleAction {
  mockBeforeRequest, // return mock without hitting server
  breakpoint, // pause response for editing in VSCode
}

class MockResponseData {
  final int statusCode;
  final Map<String, dynamic> headers;
  final dynamic body;
  final int? delayMs; // simulate latency

  MockResponseData({
    required this.statusCode,
    this.headers = const {},
    this.body,
    this.delayMs,
  });

  factory MockResponseData.fromMap(Map<String, dynamic> map) =>
      MockResponseData(
        statusCode: map['statusCode'] as int? ?? 200,
        headers: Map<String, dynamic>.from(
            map['headers'] as Map<String, dynamic>? ?? {}),
        body: map['body'],
        delayMs: map['delayMs'] as int?,
      );
}

/// Safely serialize body content (handles FormData, streams, etc.)
dynamic _serializeBody(dynamic body) {
  if (body == null) return null;
  if (body is String) return body;
  if (body is Map || body is List) {
    try {
      return jsonDecode(jsonEncode(body));
    } catch (_) {
      return body.toString();
    }
  }
  return body.toString();
}