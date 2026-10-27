// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class SEn extends S {
  SEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Where are my kids';

  @override
  String get childAppTitle => 'Where are my kids: Child';

  @override
  String get retry => 'Try again';

  @override
  String get cancel => 'Cancel';

  @override
  String get save => 'Save';

  @override
  String get delete => 'Delete';

  @override
  String get create => 'Create';

  @override
  String get next => 'Next';

  @override
  String get errorNetwork =>
      'No internet connection. Data will update once you\'re back online.';

  @override
  String get errorGeneric => 'Something went wrong. Please try again.';

  @override
  String get signIn => 'Sign in';

  @override
  String get signUp => 'Create account';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get passwordHint => 'At least 10 characters';

  @override
  String get yourName => 'Your name';

  @override
  String get acceptPrivacy => 'I accept the privacy policy';

  @override
  String get haveAccount => 'Already have an account? Sign in';

  @override
  String get noAccount => 'No account? Sign up';

  @override
  String get invalidCredentials => 'Incorrect email or password';

  @override
  String get emailTaken => 'An account with this email already exists';

  @override
  String get invalidEmail => 'Check the email address';

  @override
  String get tooManyAttempts => 'Too many attempts. Wait a minute.';

  @override
  String get logout => 'Sign out';

  @override
  String get createFamilyTitle => 'Create your family';

  @override
  String get familyName => 'Family name';

  @override
  String get familyNameHint => 'For example, the Kovalenkos';

  @override
  String get addChild => 'Add a child';

  @override
  String get childName => 'Child\'s name';

  @override
  String get birthYear => 'Year of birth';

  @override
  String get childPhone => 'Child\'s phone number';

  @override
  String get phoneHint => '+380 67 123 45 67';

  @override
  String get invalidPhone => 'Enter a number like +380 67 123 45 67';

  @override
  String get planLimit =>
      'You\'ve reached your plan\'s limit. Upgrade to Premium to add more.';

  @override
  String get inviteTitle => 'Connect your child\'s phone';

  @override
  String get inviteSteps =>
      '1. Install “Where are my kids: Child” on your child\'s phone.\n2. Scan the QR code or enter the code.';

  @override
  String inviteExpires(String time) {
    return 'Code valid until $time';
  }

  @override
  String get newCode => 'New code';

  @override
  String get statusOnline => 'online';

  @override
  String get statusRecent => 'recently';

  @override
  String get statusOffline => 'no connection';

  @override
  String get statusPaused => 'paused';

  @override
  String get justNow => 'just now';

  @override
  String minutesAgo(int count) {
    return '$count min ago';
  }

  @override
  String hoursAgo(int count) {
    return '$count h ago';
  }

  @override
  String get history => 'History';

  @override
  String get call => 'Call';

  @override
  String get updateNow => 'Update now';

  @override
  String get updateRequested => 'Request sent to your child\'s phone';

  @override
  String get notConnected => 'Not connected';

  @override
  String get connectPhone => 'Connect phone';

  @override
  String get noLocationYet => 'No location yet';

  @override
  String dataAsOf(String time) {
    return 'Offline. Data as of $time';
  }

  @override
  String get zones => 'Zones';

  @override
  String get noChildren => 'Add a child to see them on the map';

  @override
  String accuracy(int meters) {
    return 'accuracy $meters m';
  }

  @override
  String sosTitle(String name) {
    return '$name: SOS!';
  }

  @override
  String sosAt(String time) {
    return 'Alert at $time';
  }

  @override
  String sosBattery(int level) {
    return 'Battery $level%';
  }

  @override
  String get sosAck => 'I see it, on my way';

  @override
  String get sosResolve => 'Resolved';

  @override
  String sosAcknowledgedBy(String name) {
    return '$name acknowledged';
  }

  @override
  String get sosCall112 => 'Call 112';

  @override
  String get sosCall112Confirm =>
      'Call 112? This is an emergency line: call only in real danger.';

  @override
  String get yesCall => 'Yes, call';

  @override
  String get no => 'No';

  @override
  String get sosRoute => 'Route for the last 30 min';

  @override
  String get sosNoLocation =>
      'No fresh coordinates yet, showing the last known place';

  @override
  String get historyTitle => 'Location history';

  @override
  String get today => 'Today';

  @override
  String get yesterday => 'Yesterday';

  @override
  String get noPoints => 'No points for this period';

  @override
  String get historyLimited => 'The free plan keeps 24 hours of history';

  @override
  String get zonesTitle => 'Safe zones';

  @override
  String get addZone => 'Add zone';

  @override
  String get zoneHome => 'Home';

  @override
  String get zoneSchool => 'School';

  @override
  String get zoneSport => 'Sports';

  @override
  String get zoneOther => 'Other';

  @override
  String get zoneName => 'Zone name';

  @override
  String radius(int meters) {
    return 'Radius: $meters m';
  }

  @override
  String get tapMapToPlace => 'Tap the map to place the zone centre';

  @override
  String get notifyEnter => 'Notify on arrival';

  @override
  String get notifyExit => 'Notify on leaving';

  @override
  String get noZones =>
      'Add home, school or a club to get notified when your child arrives and leaves';

  @override
  String get childWelcomeTitle => 'Hi! Here your parents can see where you are';

  @override
  String get consentTitle => 'What your parents see';

  @override
  String get consentBody =>
      'Once connected, your parents will see where this phone is, its battery level and recent location history.\n\nThe phone always shows that location is being shared. You can see exactly who has access and can disconnect in settings; your parents will be notified.';

  @override
  String get consentAccept => 'Got it, I agree';

  @override
  String get enterCode => 'Code from your parent';

  @override
  String get scanQr => 'Scan QR code';

  @override
  String get connect => 'Connect';

  @override
  String get inviteInvalid =>
      'The code is wrong or expired. Ask your parent for a new one.';

  @override
  String get permissionTitle => 'Location permission';

  @override
  String get permissionBody =>
      'So your parents can see you even when the app is closed, choose “Allow all the time”.';

  @override
  String get permissionGrant => 'Grant permission';

  @override
  String get permissionSettings => 'Open settings';

  @override
  String get permissionWhileInUse =>
      'Location is shared only while the app is open. Allow “All the time” for background sharing.';

  @override
  String get locationServiceOff =>
      'Location is turned off on this phone. Turn it on in settings.';

  @override
  String get parentsSee => 'Your location is visible to';

  @override
  String get sharingOn => 'Location sharing is on';

  @override
  String pendingPoints(int count) {
    return 'No internet. Points saved: $count';
  }

  @override
  String get sendLocation => 'Send my location';

  @override
  String get sent => 'Sent';

  @override
  String get sosHold => 'Hold for 3 seconds';

  @override
  String sosCountdown(int seconds) {
    return 'SOS in $seconds…';
  }

  @override
  String get sosSent => 'SOS sent. Your parents got the alert.';

  @override
  String sosAckByChild(String name) {
    return '$name sees your alert';
  }

  @override
  String get sosCancel => 'Cancel alert';

  @override
  String get sosSmsFallback => 'No internet. Send an SMS to your parents?';

  @override
  String get sendSms => 'Send SMS';

  @override
  String sosSmsText(String link) {
    return 'SOS! I need help. I\'m here: $link';
  }

  @override
  String get pauseHour => 'Pause for 1 hour';

  @override
  String pausedUntil(String time) {
    return 'Sharing paused until $time';
  }

  @override
  String get resume => 'Resume';

  @override
  String get leaveFamily => 'Leave the family';

  @override
  String get leaveConfirm =>
      'Your parents will be notified and your location history will be deleted. Continue?';

  @override
  String get leave => 'Disconnect';

  @override
  String get trackingNoticeTitle => 'Where are my kids';

  @override
  String get trackingNoticeText => 'Location is shared with your parents';

  @override
  String get trackingChannel => 'Location sharing';

  @override
  String get settings => 'Settings';

  @override
  String get language => 'Language';

  @override
  String get exportData => 'Export my data';

  @override
  String get deleteAccount => 'Delete account';

  @override
  String get deleteAccountConfirm =>
      'Your account, family, children and all location history will be deleted. This cannot be undone.';
}
