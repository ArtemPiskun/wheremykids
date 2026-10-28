import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/api.dart';
import 'common.dart';

/// Розмова батьків з дитиною. Для батьків передається childId, для дитини — null.
/// Нові повідомлення підтягуються раз на 5 с (пуш про них приходить окремо).
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.api, required this.title, this.childId});
  final Api api;
  final String title;
  final String? childId;
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _messages = <ChatMessage>[];
  final _input = TextEditingController();
  final _scroll = ScrollController();
  Timer? _timer;
  bool _sending = false;

  bool get _iAmChild => widget.childId == null;

  @override
  void initState() {
    super.initState();
    _poll();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _poll());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _poll() async {
    try {
      final fresh = await widget.api.messages(childId: widget.childId, after: _messages.isEmpty ? null : _messages.last.id);
      if (fresh.isEmpty || !mounted) return;
      setState(() => _messages.addAll(fresh));
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
      });
    } catch (_) {}
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await widget.api.sendMessage(text, childId: widget.childId);
      _input.clear();
      await _poll();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Column(children: [
        Expanded(
          child: _messages.isEmpty
              ? const Center(child: Text('Повідомлень поки немає'))
              : ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(12),
                  itemCount: _messages.length,
                  itemBuilder: (_, i) {
                    final m = _messages[i];
                    // «Свої» — з боку дитини для дитини, з боку батьків для батьків
                    final mine = m.fromChild == _iAmChild;
                    return Align(
                      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                        decoration: BoxDecoration(
                          color: mine ? scheme.primaryContainer : scheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          if (!mine || !_iAmChild)
                            Text(m.senderName, style: TextStyle(fontSize: 12, color: scheme.primary, fontWeight: FontWeight.w600)),
                          Text(m.text),
                          Text(DateFormat('HH:mm', 'uk').format(m.createdAt), style: const TextStyle(fontSize: 11, color: Colors.grey)),
                        ]),
                      ),
                    );
                  },
                ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 8, 8),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  minLines: 1,
                  maxLines: 4,
                  maxLength: 2000,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(hintText: 'Повідомлення', counterText: '', border: OutlineInputBorder()),
                ),
              ),
              IconButton.filled(onPressed: _sending ? null : _send, icon: const Icon(Icons.send)),
            ]),
          ),
        ),
      ]),
    );
  }
}
