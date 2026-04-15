import 'package:flutter/material.dart';
import 'package:example/network_helper.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  /// Initialize network helper
  await NetworkHelper.instance.init();

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Net Inspector Example',
      theme: ThemeData(colorScheme: .fromSeed(seedColor: Colors.deepPurple)),
      home: const MyHomePage(title: 'Flutter Net Inspector Example'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  String _title = '-';

  Future<void> _fetchTodo() async {
    final result = await NetworkHelper.instance.getTodo();
    setState(() {
      _title = result;
    });
  }

  @override
  void dispose() {
    NetworkHelper.instance.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Response text:'),
            Text(
              _title,
              style: Theme.of(context).textTheme.headlineMedium,
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _fetchTodo,
        tooltip: 'Fetch Todo',
        child: const Icon(Icons.refresh),
      ),
    );
  }
}
