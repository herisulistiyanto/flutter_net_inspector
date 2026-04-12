import 'dart:async';
import 'dart:developer' as developer;
import 'dart:io';

import 'models.dart';

typedef OnMessageCallback = void Function(InspectorMessage message);
typedef OnConnectionChanged = void Function(bool connected);

/// WebSocket client running inside the Flutter app.
/// Connects to the VSCode extension's WebSocket server.
class InspectorClient {
  final String host;
  final int port;
  final Duration reconnectInterval;
  final int maxReconnectAttempts;

  WebSocket? _socket;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  bool _disposed = false;
  bool _connected = false;

  final _messageController = StreamController<InspectorMessage>.broadcast();
  final List<OnConnectionChanged> _connectionListeners = [];

  /// Stream of incoming messages from VSCode
  Stream<InspectorMessage> get messages => _messageController.stream;
  bool get isConnected => _connected;

  InspectorClient({
    this.host = '127.0.0.1',
    this.port = 9555,
    this.reconnectInterval = const Duration(seconds: 3),
    this.maxReconnectAttempts = 50,
  });

  /// Register a connection state listener
  void addConnectionListener(OnConnectionChanged listener) {
    _connectionListeners.add(listener);
  }

  /// Connect to the VSCode extension WebSocket server
  Future<void> connect() async {
    if (_disposed) return;
    try {
      _socket = await WebSocket.connect('ws://$host:$port/inspector')
          .timeout(const Duration(seconds: 5));

      _reconnectAttempts = 0;
      _setConnected(true);

      _log('Connected to inspector server at ws://$host:$port');

      // Send handshake
      send(InspectorMessage(
        type: MessageType.app_connected,
        id: 'handshake',
        payload: {
          'appId': 'flutter_app_${DateTime.now().millisecondsSinceEpoch}',
          'platform': Platform.operatingSystem,
          'dartVersion': Platform.version.split(' ').first,
        },
      ));

      _socket!.listen(
        (data) => _handleMessage(data as String),
        onDone: () {
          _setConnected(false);
          _log('Disconnected from inspector server');
          _scheduleReconnect();
        },
        onError: (error) {
          _log('WebSocket error: $error');
          _setConnected(false);
          _scheduleReconnect();
        },
      );
    } on SocketException catch (e) {
      _log('Cannot connect to inspector: ${e.message}');
      _scheduleReconnect();
    } on TimeoutException {
      _log('Connection timeout');
      _scheduleReconnect();
    } catch (e) {
      _log('Connection error: $e');
      _scheduleReconnect();
    }
  }

  /// Send a message to VSCode
  void send(InspectorMessage message) {
    if (!_connected || _socket == null) return;
    try {
      _socket!.add(message.toJson());
    } catch (e) {
      _log('Send error: $e');
    }
  }

  /// Send raw captured request data
  void sendRequest(Map<String, dynamic> requestData) {
    send(InspectorMessage(
      type: MessageType.request_captured,
      id: requestData['id'] as String,
      payload: requestData,
    ));
  }

  /// Send raw captured response data
  void sendResponse(Map<String, dynamic> responseData) {
    send(InspectorMessage(
      type: MessageType.response_captured,
      id: responseData['requestId'] as String,
      payload: responseData,
    ));
  }

  /// Send error data
  void sendError(String requestId, Map<String, dynamic> errorData) {
    send(InspectorMessage(
      type: MessageType.error_captured,
      id: requestId,
      payload: errorData,
    ));
  }

  void _handleMessage(String raw) {
    try {
      final message = InspectorMessage.fromJson(raw);
      _messageController.add(message);
    } catch (e) {
      _log('Failed to parse message: $e');
    }
  }

  void _setConnected(bool value) {
    _connected = value;
    for (final listener in _connectionListeners) {
      listener(value);
    }
  }

  void _scheduleReconnect() {
    if (_disposed) return;
    if (_reconnectAttempts >= maxReconnectAttempts) {
      _log('Max reconnect attempts reached');
      return;
    }

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(reconnectInterval, () {
      _reconnectAttempts++;
      connect();
    });
  }

  void _log(String msg) {
    developer.log(msg, name: 'NetInspector');
  }

  /// Clean up resources
  Future<void> dispose() async {
    _disposed = true;
    _reconnectTimer?.cancel();
    send(InspectorMessage(
      type: MessageType.app_disconnected,
      id: 'disconnect',
      payload: {},
    ));
    await _socket?.close();
    await _messageController.close();
    _connectionListeners.clear();
  }
}
