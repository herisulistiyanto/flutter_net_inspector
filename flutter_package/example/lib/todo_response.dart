import 'dart:convert';

TodoResponse todoResponseFromJson(String str) =>
    TodoResponse.fromJson(json.decode(str));

String todoResponseToJson(TodoResponse data) => json.encode(data.toJson());

class TodoResponse {
  final int? userId;
  final int? id;
  final String? title;
  final bool? completed;

  TodoResponse({this.userId, this.id, this.title, this.completed});

  TodoResponse copyWith({
    int? userId,
    int? id,
    String? title,
    bool? completed,
  }) => TodoResponse(
    userId: userId ?? this.userId,
    id: id ?? this.id,
    title: title ?? this.title,
    completed: completed ?? this.completed,
  );

  factory TodoResponse.fromJson(Map<String, dynamic> json) => TodoResponse(
    userId: json["userId"],
    id: json["id"],
    title: json["title"],
    completed: json["completed"],
  );

  Map<String, dynamic> toJson() => {
    "userId": userId,
    "id": id,
    "title": title,
    "completed": completed,
  };
}
