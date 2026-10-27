import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/widgets/common.dart';
import '../../../core/config/env.dart';
import '../../../l10n/app_localizations.dart';
import '../application/auth_controller.dart';

/// Parent sign-in and sign-up on one screen; children never see it.
class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  bool _register = false;
  bool _accepted = false;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate() || (_register && !_accepted)) return;
    setState(() => _busy = true);
    final auth = ref.read(authControllerProvider);
    try {
      if (_register) {
        await auth.signUp(_email.text.trim(), _password.text, _name.text.trim(), Localizations.localeOf(context).languageCode);
      } else {
        await auth.signIn(_email.text.trim(), _password.text);
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(Icons.family_restroom, size: 56, color: Theme.of(context).colorScheme.primary),
                      const SizedBox(height: 12),
                      Text(s.appTitle, textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 32),
                      if (_register) ...[
                        TextFormField(
                          controller: _name,
                          decoration: InputDecoration(labelText: s.yourName),
                          textCapitalization: TextCapitalization.words,
                          autofillHints: const [AutofillHints.givenName],
                          validator: (v) => (v == null || v.trim().isEmpty) ? s.yourName : null,
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        controller: _email,
                        decoration: InputDecoration(labelText: s.email),
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        validator: (v) => v != null && RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v.trim()) ? null : s.invalidEmail,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _password,
                        obscureText: true,
                        decoration: InputDecoration(labelText: s.password, helperText: _register ? s.passwordHint : null),
                        autofillHints: [_register ? AutofillHints.newPassword : AutofillHints.password],
                        validator: (v) => (v ?? '').length < (_register ? 10 : 1) ? s.passwordHint : null,
                        onFieldSubmitted: (_) => _submit(),
                      ),
                      if (_register)
                        CheckboxListTile(
                          value: _accepted,
                          onChanged: (v) => setState(() => _accepted = v ?? false),
                          contentPadding: EdgeInsets.zero,
                          controlAffinity: ListTileControlAffinity.leading,
                          title: Text(s.acceptPrivacy),
                          subtitle: const Text(Env.privacyPolicyUrl),
                        ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: _busy || (_register && !_accepted) ? null : _submit,
                        child: _busy ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2)) : Text(_register ? s.signUp : s.signIn),
                      ),
                      TextButton(
                        onPressed: _busy ? null : () => setState(() => _register = !_register),
                        child: Text(_register ? s.haveAccount : s.noAccount),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
