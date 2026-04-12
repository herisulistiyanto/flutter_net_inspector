import 'dart:developer' as developer;

import 'models.dart';

/// Stores and matches mock rules received from the VSCode extension.
/// Thread-safe via synchronous operations (Dart is single-threaded).
class MockRuleStore {
  final Map<String, MockRule> _rules = {};

  /// All currently registered rules
  List<MockRule> get rules => _rules.values.toList();

  /// Add or update a mock rule
  void addRule(MockRule rule) {
    _rules[rule.id] = rule;
    _log('Rule added: ${rule.urlPattern} (${rule.action.name})');
  }

  /// Remove a mock rule by ID
  void removeRule(String ruleId) {
    final removed = _rules.remove(ruleId);
    if (removed != null) {
      _log('Rule removed: ${removed.urlPattern}');
    }
  }

  /// Update an existing rule
  void updateRule(MockRule rule) {
    _rules[rule.id] = rule;
    _log('Rule updated: ${rule.urlPattern}');
  }

  /// Clear all rules
  void clearRules() {
    _rules.clear();
    _log('All rules cleared');
  }

  /// Find the first matching rule for a given request.
  /// Returns null if no rule matches.
  MockRule? findMatch(String url, String method) {
    for (final rule in _rules.values) {
      if (rule.matches(url, method)) {
        return rule;
      }
    }
    return null;
  }

  void _log(String msg) {
    developer.log(msg, name: 'NetInspector.MockStore');
  }
}
