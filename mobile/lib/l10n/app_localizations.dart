import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_ru.dart';
import 'app_localizations_uk.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of S
/// returned by `S.of(context)`.
///
/// Applications need to include `S.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: S.localizationsDelegates,
///   supportedLocales: S.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the S.supportedLocales
/// property.
abstract class S {
  S(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static S of(BuildContext context) {
    return Localizations.of<S>(context, S)!;
  }

  static const LocalizationsDelegate<S> delegate = _SDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('ru'),
    Locale('uk')
  ];

  /// No description provided for @appTitle.
  ///
  /// In uk, this message translates to:
  /// **'Де мої діти'**
  String get appTitle;

  /// No description provided for @childAppTitle.
  ///
  /// In uk, this message translates to:
  /// **'Де мої діти: Дитина'**
  String get childAppTitle;

  /// No description provided for @retry.
  ///
  /// In uk, this message translates to:
  /// **'Спробувати ще'**
  String get retry;

  /// No description provided for @cancel.
  ///
  /// In uk, this message translates to:
  /// **'Скасувати'**
  String get cancel;

  /// No description provided for @save.
  ///
  /// In uk, this message translates to:
  /// **'Зберегти'**
  String get save;

  /// No description provided for @delete.
  ///
  /// In uk, this message translates to:
  /// **'Видалити'**
  String get delete;

  /// No description provided for @create.
  ///
  /// In uk, this message translates to:
  /// **'Створити'**
  String get create;

  /// No description provided for @next.
  ///
  /// In uk, this message translates to:
  /// **'Далі'**
  String get next;

  /// No description provided for @errorNetwork.
  ///
  /// In uk, this message translates to:
  /// **'Немає з\'єднання з інтернетом. Дані оновляться, щойно зв\'язок повернеться.'**
  String get errorNetwork;

  /// No description provided for @errorGeneric.
  ///
  /// In uk, this message translates to:
  /// **'Щось пішло не так. Спробуйте ще раз.'**
  String get errorGeneric;

  /// No description provided for @signIn.
  ///
  /// In uk, this message translates to:
  /// **'Увійти'**
  String get signIn;

  /// No description provided for @signUp.
  ///
  /// In uk, this message translates to:
  /// **'Створити акаунт'**
  String get signUp;

  /// No description provided for @email.
  ///
  /// In uk, this message translates to:
  /// **'Електронна пошта'**
  String get email;

  /// No description provided for @password.
  ///
  /// In uk, this message translates to:
  /// **'Пароль'**
  String get password;

  /// No description provided for @passwordHint.
  ///
  /// In uk, this message translates to:
  /// **'Щонайменше 10 символів'**
  String get passwordHint;

  /// No description provided for @yourName.
  ///
  /// In uk, this message translates to:
  /// **'Ваше ім\'я'**
  String get yourName;

  /// No description provided for @acceptPrivacy.
  ///
  /// In uk, this message translates to:
  /// **'Я приймаю політику конфіденційності'**
  String get acceptPrivacy;

  /// No description provided for @haveAccount.
  ///
  /// In uk, this message translates to:
  /// **'Вже маєте акаунт? Увійти'**
  String get haveAccount;

  /// No description provided for @noAccount.
  ///
  /// In uk, this message translates to:
  /// **'Немає акаунта? Зареєструватися'**
  String get noAccount;

  /// No description provided for @invalidCredentials.
  ///
  /// In uk, this message translates to:
  /// **'Неправильна пошта або пароль'**
  String get invalidCredentials;

  /// No description provided for @emailTaken.
  ///
  /// In uk, this message translates to:
  /// **'Акаунт з цією поштою вже існує'**
  String get emailTaken;

  /// No description provided for @invalidEmail.
  ///
  /// In uk, this message translates to:
  /// **'Перевірте адресу пошти'**
  String get invalidEmail;

  /// No description provided for @tooManyAttempts.
  ///
  /// In uk, this message translates to:
  /// **'Забагато спроб. Зачекайте хвилину.'**
  String get tooManyAttempts;

  /// No description provided for @logout.
  ///
  /// In uk, this message translates to:
  /// **'Вийти'**
  String get logout;

  /// No description provided for @createFamilyTitle.
  ///
  /// In uk, this message translates to:
  /// **'Створіть сім\'ю'**
  String get createFamilyTitle;

  /// No description provided for @familyName.
  ///
  /// In uk, this message translates to:
  /// **'Назва сім\'ї'**
  String get familyName;

  /// No description provided for @familyNameHint.
  ///
  /// In uk, this message translates to:
  /// **'Наприклад, Коваленки'**
  String get familyNameHint;

  /// No description provided for @addChild.
  ///
  /// In uk, this message translates to:
  /// **'Додати дитину'**
  String get addChild;

  /// No description provided for @childName.
  ///
  /// In uk, this message translates to:
  /// **'Ім\'я дитини'**
  String get childName;

  /// No description provided for @birthYear.
  ///
  /// In uk, this message translates to:
  /// **'Рік народження'**
  String get birthYear;

  /// No description provided for @childPhone.
  ///
  /// In uk, this message translates to:
  /// **'Номер телефону дитини'**
  String get childPhone;

  /// No description provided for @phoneHint.
  ///
  /// In uk, this message translates to:
  /// **'+380 67 123 45 67'**
  String get phoneHint;

  /// No description provided for @invalidPhone.
  ///
  /// In uk, this message translates to:
  /// **'Введіть номер у форматі +380 67 123 45 67'**
  String get invalidPhone;

  /// No description provided for @planLimit.
  ///
  /// In uk, this message translates to:
  /// **'На вашому тарифі ліміт вичерпано. Перейдіть на Преміум, щоб додати більше.'**
  String get planLimit;

  /// No description provided for @inviteTitle.
  ///
  /// In uk, this message translates to:
  /// **'Під\'єднайте телефон дитини'**
  String get inviteTitle;

  /// No description provided for @inviteSteps.
  ///
  /// In uk, this message translates to:
  /// **'1. Встановіть «Де мої діти: Дитина» на телефон дитини.\n2. Відскануйте QR-код або введіть код.'**
  String get inviteSteps;

  /// No description provided for @inviteExpires.
  ///
  /// In uk, this message translates to:
  /// **'Код дійсний до {time}'**
  String inviteExpires(String time);

  /// No description provided for @newCode.
  ///
  /// In uk, this message translates to:
  /// **'Новий код'**
  String get newCode;

  /// No description provided for @statusOnline.
  ///
  /// In uk, this message translates to:
  /// **'онлайн'**
  String get statusOnline;

  /// No description provided for @statusRecent.
  ///
  /// In uk, this message translates to:
  /// **'недавно'**
  String get statusRecent;

  /// No description provided for @statusOffline.
  ///
  /// In uk, this message translates to:
  /// **'немає зв\'язку'**
  String get statusOffline;

  /// No description provided for @statusPaused.
  ///
  /// In uk, this message translates to:
  /// **'пауза'**
  String get statusPaused;

  /// No description provided for @justNow.
  ///
  /// In uk, this message translates to:
  /// **'щойно'**
  String get justNow;

  /// No description provided for @minutesAgo.
  ///
  /// In uk, this message translates to:
  /// **'{count} хв тому'**
  String minutesAgo(int count);

  /// No description provided for @hoursAgo.
  ///
  /// In uk, this message translates to:
  /// **'{count} год тому'**
  String hoursAgo(int count);

  /// No description provided for @history.
  ///
  /// In uk, this message translates to:
  /// **'Історія'**
  String get history;

  /// No description provided for @call.
  ///
  /// In uk, this message translates to:
  /// **'Подзвонити'**
  String get call;

  /// No description provided for @updateNow.
  ///
  /// In uk, this message translates to:
  /// **'Оновити зараз'**
  String get updateNow;

  /// No description provided for @updateRequested.
  ///
  /// In uk, this message translates to:
  /// **'Запит надіслано на телефон дитини'**
  String get updateRequested;

  /// No description provided for @notConnected.
  ///
  /// In uk, this message translates to:
  /// **'Не під\'єднано'**
  String get notConnected;

  /// No description provided for @connectPhone.
  ///
  /// In uk, this message translates to:
  /// **'Під\'єднати телефон'**
  String get connectPhone;

  /// No description provided for @noLocationYet.
  ///
  /// In uk, this message translates to:
  /// **'Ще немає геолокації'**
  String get noLocationYet;

  /// No description provided for @dataAsOf.
  ///
  /// In uk, this message translates to:
  /// **'Немає з\'єднання. Дані станом на {time}'**
  String dataAsOf(String time);

  /// No description provided for @zones.
  ///
  /// In uk, this message translates to:
  /// **'Зони'**
  String get zones;

  /// No description provided for @noChildren.
  ///
  /// In uk, this message translates to:
  /// **'Додайте дитину, щоб бачити її на карті'**
  String get noChildren;

  /// No description provided for @accuracy.
  ///
  /// In uk, this message translates to:
  /// **'точність {meters} м'**
  String accuracy(int meters);

  /// No description provided for @sosTitle.
  ///
  /// In uk, this message translates to:
  /// **'{name}: SOS!'**
  String sosTitle(String name);

  /// No description provided for @sosAt.
  ///
  /// In uk, this message translates to:
  /// **'Сигнал о {time}'**
  String sosAt(String time);

  /// No description provided for @sosBattery.
  ///
  /// In uk, this message translates to:
  /// **'Батарея {level}%'**
  String sosBattery(int level);

  /// No description provided for @sosAck.
  ///
  /// In uk, this message translates to:
  /// **'Бачу, вже дію'**
  String get sosAck;

  /// No description provided for @sosResolve.
  ///
  /// In uk, this message translates to:
  /// **'Вирішено'**
  String get sosResolve;

  /// No description provided for @sosAcknowledgedBy.
  ///
  /// In uk, this message translates to:
  /// **'{name} підтверджує'**
  String sosAcknowledgedBy(String name);

  /// No description provided for @sosCall112.
  ///
  /// In uk, this message translates to:
  /// **'Викликати 112'**
  String get sosCall112;

  /// No description provided for @sosCall112Confirm.
  ///
  /// In uk, this message translates to:
  /// **'Зателефонувати на 112? Це екстрена лінія: дзвоніть лише за реальної небезпеки.'**
  String get sosCall112Confirm;

  /// No description provided for @yesCall.
  ///
  /// In uk, this message translates to:
  /// **'Так, телефонувати'**
  String get yesCall;

  /// No description provided for @no.
  ///
  /// In uk, this message translates to:
  /// **'Ні'**
  String get no;

  /// No description provided for @sosRoute.
  ///
  /// In uk, this message translates to:
  /// **'Маршрут за останні 30 хв'**
  String get sosRoute;

  /// No description provided for @sosNoLocation.
  ///
  /// In uk, this message translates to:
  /// **'Координати ще не отримано, показано останнє відоме місце'**
  String get sosNoLocation;

  /// No description provided for @historyTitle.
  ///
  /// In uk, this message translates to:
  /// **'Історія переміщень'**
  String get historyTitle;

  /// No description provided for @today.
  ///
  /// In uk, this message translates to:
  /// **'Сьогодні'**
  String get today;

  /// No description provided for @yesterday.
  ///
  /// In uk, this message translates to:
  /// **'Вчора'**
  String get yesterday;

  /// No description provided for @noPoints.
  ///
  /// In uk, this message translates to:
  /// **'За цей період немає точок'**
  String get noPoints;

  /// No description provided for @historyLimited.
  ///
  /// In uk, this message translates to:
  /// **'На безкоштовному тарифі доступна історія за 24 години'**
  String get historyLimited;

  /// No description provided for @zonesTitle.
  ///
  /// In uk, this message translates to:
  /// **'Безпечні зони'**
  String get zonesTitle;

  /// No description provided for @addZone.
  ///
  /// In uk, this message translates to:
  /// **'Додати зону'**
  String get addZone;

  /// No description provided for @zoneHome.
  ///
  /// In uk, this message translates to:
  /// **'Дім'**
  String get zoneHome;

  /// No description provided for @zoneSchool.
  ///
  /// In uk, this message translates to:
  /// **'Школа'**
  String get zoneSchool;

  /// No description provided for @zoneSport.
  ///
  /// In uk, this message translates to:
  /// **'Спортзал'**
  String get zoneSport;

  /// No description provided for @zoneOther.
  ///
  /// In uk, this message translates to:
  /// **'Інше'**
  String get zoneOther;

  /// No description provided for @zoneName.
  ///
  /// In uk, this message translates to:
  /// **'Назва зони'**
  String get zoneName;

  /// No description provided for @radius.
  ///
  /// In uk, this message translates to:
  /// **'Радіус: {meters} м'**
  String radius(int meters);

  /// No description provided for @tapMapToPlace.
  ///
  /// In uk, this message translates to:
  /// **'Торкніться карти, щоб поставити центр зони'**
  String get tapMapToPlace;

  /// No description provided for @notifyEnter.
  ///
  /// In uk, this message translates to:
  /// **'Сповіщати про вхід'**
  String get notifyEnter;

  /// No description provided for @notifyExit.
  ///
  /// In uk, this message translates to:
  /// **'Сповіщати про вихід'**
  String get notifyExit;

  /// No description provided for @noZones.
  ///
  /// In uk, this message translates to:
  /// **'Додайте дім, школу чи секцію, щоб отримувати сповіщення, коли дитина приходить і йде'**
  String get noZones;

  /// No description provided for @childWelcomeTitle.
  ///
  /// In uk, this message translates to:
  /// **'Привіт! Тут батьки зможуть бачити, де ти'**
  String get childWelcomeTitle;

  /// No description provided for @consentTitle.
  ///
  /// In uk, this message translates to:
  /// **'Що бачать батьки'**
  String get consentTitle;

  /// No description provided for @consentBody.
  ///
  /// In uk, this message translates to:
  /// **'Після під\'єднання батьки бачитимуть, де знаходиться цей телефон, заряд батареї та історію переміщень за останні дні.\n\nНа телефоні завжди видно, що геолокація передається. Ти бачиш, хто саме має доступ, і можеш від\'єднатися в налаштуваннях: батьки отримають про це сповіщення.'**
  String get consentBody;

  /// No description provided for @consentAccept.
  ///
  /// In uk, this message translates to:
  /// **'Зрозуміло, погоджуюся'**
  String get consentAccept;

  /// No description provided for @enterCode.
  ///
  /// In uk, this message translates to:
  /// **'Код від батьків'**
  String get enterCode;

  /// No description provided for @scanQr.
  ///
  /// In uk, this message translates to:
  /// **'Сканувати QR-код'**
  String get scanQr;

  /// No description provided for @connect.
  ///
  /// In uk, this message translates to:
  /// **'Під\'єднатися'**
  String get connect;

  /// No description provided for @inviteInvalid.
  ///
  /// In uk, this message translates to:
  /// **'Код неправильний або застарів. Попроси батьків створити новий.'**
  String get inviteInvalid;

  /// No description provided for @permissionTitle.
  ///
  /// In uk, this message translates to:
  /// **'Дозвіл на геолокацію'**
  String get permissionTitle;

  /// No description provided for @permissionBody.
  ///
  /// In uk, this message translates to:
  /// **'Щоб батьки бачили, де ти, навіть коли застосунок закритий, обери «Дозволяти завжди».'**
  String get permissionBody;

  /// No description provided for @permissionGrant.
  ///
  /// In uk, this message translates to:
  /// **'Надати дозвіл'**
  String get permissionGrant;

  /// No description provided for @permissionSettings.
  ///
  /// In uk, this message translates to:
  /// **'Відкрити налаштування'**
  String get permissionSettings;

  /// No description provided for @permissionWhileInUse.
  ///
  /// In uk, this message translates to:
  /// **'Зараз геолокація передається лише коли застосунок відкритий. Для роботи у фоні дозволь «Завжди».'**
  String get permissionWhileInUse;

  /// No description provided for @locationServiceOff.
  ///
  /// In uk, this message translates to:
  /// **'Геолокацію на телефоні вимкнено. Увімкни її в налаштуваннях.'**
  String get locationServiceOff;

  /// No description provided for @parentsSee.
  ///
  /// In uk, this message translates to:
  /// **'Твою геолокацію бачать'**
  String get parentsSee;

  /// No description provided for @sharingOn.
  ///
  /// In uk, this message translates to:
  /// **'Геолокація передається'**
  String get sharingOn;

  /// No description provided for @pendingPoints.
  ///
  /// In uk, this message translates to:
  /// **'Немає інтернету. Збережено точок: {count}'**
  String pendingPoints(int count);

  /// No description provided for @sendLocation.
  ///
  /// In uk, this message translates to:
  /// **'Надіслати, де я'**
  String get sendLocation;

  /// No description provided for @sent.
  ///
  /// In uk, this message translates to:
  /// **'Надіслано'**
  String get sent;

  /// No description provided for @sosHold.
  ///
  /// In uk, this message translates to:
  /// **'Утримуй 3 секунди'**
  String get sosHold;

  /// No description provided for @sosCountdown.
  ///
  /// In uk, this message translates to:
  /// **'SOS через {seconds}…'**
  String sosCountdown(int seconds);

  /// No description provided for @sosSent.
  ///
  /// In uk, this message translates to:
  /// **'SOS надіслано. Батьки отримали сигнал.'**
  String get sosSent;

  /// No description provided for @sosAckByChild.
  ///
  /// In uk, this message translates to:
  /// **'{name} бачить твій сигнал'**
  String sosAckByChild(String name);

  /// No description provided for @sosCancel.
  ///
  /// In uk, this message translates to:
  /// **'Скасувати тривогу'**
  String get sosCancel;

  /// No description provided for @sosSmsFallback.
  ///
  /// In uk, this message translates to:
  /// **'Немає інтернету. Надіслати SMS батькам?'**
  String get sosSmsFallback;

  /// No description provided for @sendSms.
  ///
  /// In uk, this message translates to:
  /// **'Надіслати SMS'**
  String get sendSms;

  /// No description provided for @sosSmsText.
  ///
  /// In uk, this message translates to:
  /// **'SOS! Мені потрібна допомога. Я тут: {link}'**
  String sosSmsText(String link);

  /// No description provided for @pauseHour.
  ///
  /// In uk, this message translates to:
  /// **'Призупинити на 1 годину'**
  String get pauseHour;

  /// No description provided for @pausedUntil.
  ///
  /// In uk, this message translates to:
  /// **'Передачу призупинено до {time}'**
  String pausedUntil(String time);

  /// No description provided for @resume.
  ///
  /// In uk, this message translates to:
  /// **'Відновити'**
  String get resume;

  /// No description provided for @leaveFamily.
  ///
  /// In uk, this message translates to:
  /// **'Від\'єднатися від сім\'ї'**
  String get leaveFamily;

  /// No description provided for @leaveConfirm.
  ///
  /// In uk, this message translates to:
  /// **'Батьки отримають сповіщення, а історію переміщень буде видалено. Продовжити?'**
  String get leaveConfirm;

  /// No description provided for @leave.
  ///
  /// In uk, this message translates to:
  /// **'Від\'єднатися'**
  String get leave;

  /// No description provided for @trackingNoticeTitle.
  ///
  /// In uk, this message translates to:
  /// **'Де мої діти'**
  String get trackingNoticeTitle;

  /// No description provided for @trackingNoticeText.
  ///
  /// In uk, this message translates to:
  /// **'Геолокація передається батькам'**
  String get trackingNoticeText;

  /// No description provided for @trackingChannel.
  ///
  /// In uk, this message translates to:
  /// **'Передача геолокації'**
  String get trackingChannel;

  /// No description provided for @settings.
  ///
  /// In uk, this message translates to:
  /// **'Налаштування'**
  String get settings;

  /// No description provided for @language.
  ///
  /// In uk, this message translates to:
  /// **'Мова'**
  String get language;

  /// No description provided for @exportData.
  ///
  /// In uk, this message translates to:
  /// **'Експортувати мої дані'**
  String get exportData;

  /// No description provided for @deleteAccount.
  ///
  /// In uk, this message translates to:
  /// **'Видалити акаунт'**
  String get deleteAccount;

  /// No description provided for @deleteAccountConfirm.
  ///
  /// In uk, this message translates to:
  /// **'Буде видалено акаунт, сім\'ю, дітей і всю історію переміщень. Це не можна скасувати.'**
  String get deleteAccountConfirm;
}

class _SDelegate extends LocalizationsDelegate<S> {
  const _SDelegate();

  @override
  Future<S> load(Locale locale) {
    return SynchronousFuture<S>(lookupS(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'ru', 'uk'].contains(locale.languageCode);

  @override
  bool shouldReload(_SDelegate old) => false;
}

S lookupS(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return SEn();
    case 'ru':
      return SRu();
    case 'uk':
      return SUk();
  }

  throw FlutterError(
      'S.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
