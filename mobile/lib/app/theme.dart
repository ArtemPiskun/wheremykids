import 'package:flutter/material.dart';

/// Calm blue for trust, warm yellow for accents, red reserved for SOS only.
abstract final class AppColors {
  static const trust = Color(0xFF1F5FD1);
  static const sun = Color(0xFFF2B705);
  static const sos = Color(0xFFC2362F);
  static const online = Color(0xFF1D8A5A);
  static const recent = Color(0xFFB26A00);
  static const offline = Color(0xFF8A93A6);
}

ThemeData buildTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(seedColor: AppColors.trust, brightness: brightness, error: AppColors.sos);
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    visualDensity: VisualDensity.standard,
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48))),
    inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder(), filled: false),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
