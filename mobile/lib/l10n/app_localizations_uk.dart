// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Ukrainian (`uk`).
class SUk extends S {
  SUk([String locale = 'uk']) : super(locale);

  @override
  String get appTitle => 'Де мої діти';

  @override
  String get childAppTitle => 'Де мої діти: Дитина';

  @override
  String get retry => 'Спробувати ще';

  @override
  String get cancel => 'Скасувати';

  @override
  String get save => 'Зберегти';

  @override
  String get delete => 'Видалити';

  @override
  String get create => 'Створити';

  @override
  String get next => 'Далі';

  @override
  String get errorNetwork =>
      'Немає з\'єднання з інтернетом. Дані оновляться, щойно зв\'язок повернеться.';

  @override
  String get errorGeneric => 'Щось пішло не так. Спробуйте ще раз.';

  @override
  String get signIn => 'Увійти';

  @override
  String get signUp => 'Створити акаунт';

  @override
  String get email => 'Електронна пошта';

  @override
  String get password => 'Пароль';

  @override
  String get passwordHint => 'Щонайменше 10 символів';

  @override
  String get yourName => 'Ваше ім\'я';

  @override
  String get acceptPrivacy => 'Я приймаю політику конфіденційності';

  @override
  String get haveAccount => 'Вже маєте акаунт? Увійти';

  @override
  String get noAccount => 'Немає акаунта? Зареєструватися';

  @override
  String get invalidCredentials => 'Неправильна пошта або пароль';

  @override
  String get emailTaken => 'Акаунт з цією поштою вже існує';

  @override
  String get invalidEmail => 'Перевірте адресу пошти';

  @override
  String get tooManyAttempts => 'Забагато спроб. Зачекайте хвилину.';

  @override
  String get logout => 'Вийти';

  @override
  String get createFamilyTitle => 'Створіть сім\'ю';

  @override
  String get familyName => 'Назва сім\'ї';

  @override
  String get familyNameHint => 'Наприклад, Коваленки';

  @override
  String get addChild => 'Додати дитину';

  @override
  String get childName => 'Ім\'я дитини';

  @override
  String get birthYear => 'Рік народження';

  @override
  String get childPhone => 'Номер телефону дитини';

  @override
  String get phoneHint => '+380 67 123 45 67';

  @override
  String get invalidPhone => 'Введіть номер у форматі +380 67 123 45 67';

  @override
  String get planLimit =>
      'На вашому тарифі ліміт вичерпано. Перейдіть на Преміум, щоб додати більше.';

  @override
  String get inviteTitle => 'Під\'єднайте телефон дитини';

  @override
  String get inviteSteps =>
      '1. Встановіть «Де мої діти: Дитина» на телефон дитини.\n2. Відскануйте QR-код або введіть код.';

  @override
  String inviteExpires(String time) {
    return 'Код дійсний до $time';
  }

  @override
  String get newCode => 'Новий код';

  @override
  String get statusOnline => 'онлайн';

  @override
  String get statusRecent => 'недавно';

  @override
  String get statusOffline => 'немає зв\'язку';

  @override
  String get statusPaused => 'пауза';

  @override
  String get justNow => 'щойно';

  @override
  String minutesAgo(int count) {
    return '$count хв тому';
  }

  @override
  String hoursAgo(int count) {
    return '$count год тому';
  }

  @override
  String get history => 'Історія';

  @override
  String get call => 'Подзвонити';

  @override
  String get updateNow => 'Оновити зараз';

  @override
  String get updateRequested => 'Запит надіслано на телефон дитини';

  @override
  String get notConnected => 'Не під\'єднано';

  @override
  String get connectPhone => 'Під\'єднати телефон';

  @override
  String get noLocationYet => 'Ще немає геолокації';

  @override
  String dataAsOf(String time) {
    return 'Немає з\'єднання. Дані станом на $time';
  }

  @override
  String get zones => 'Зони';

  @override
  String get noChildren => 'Додайте дитину, щоб бачити її на карті';

  @override
  String accuracy(int meters) {
    return 'точність $meters м';
  }

  @override
  String sosTitle(String name) {
    return '$name: SOS!';
  }

  @override
  String sosAt(String time) {
    return 'Сигнал о $time';
  }

  @override
  String sosBattery(int level) {
    return 'Батарея $level%';
  }

  @override
  String get sosAck => 'Бачу, вже дію';

  @override
  String get sosResolve => 'Вирішено';

  @override
  String sosAcknowledgedBy(String name) {
    return '$name підтверджує';
  }

  @override
  String get sosCall112 => 'Викликати 112';

  @override
  String get sosCall112Confirm =>
      'Зателефонувати на 112? Це екстрена лінія: дзвоніть лише за реальної небезпеки.';

  @override
  String get yesCall => 'Так, телефонувати';

  @override
  String get no => 'Ні';

  @override
  String get sosRoute => 'Маршрут за останні 30 хв';

  @override
  String get sosNoLocation =>
      'Координати ще не отримано, показано останнє відоме місце';

  @override
  String get historyTitle => 'Історія переміщень';

  @override
  String get today => 'Сьогодні';

  @override
  String get yesterday => 'Вчора';

  @override
  String get noPoints => 'За цей період немає точок';

  @override
  String get historyLimited =>
      'На безкоштовному тарифі доступна історія за 24 години';

  @override
  String get zonesTitle => 'Безпечні зони';

  @override
  String get addZone => 'Додати зону';

  @override
  String get zoneHome => 'Дім';

  @override
  String get zoneSchool => 'Школа';

  @override
  String get zoneSport => 'Спортзал';

  @override
  String get zoneOther => 'Інше';

  @override
  String get zoneName => 'Назва зони';

  @override
  String radius(int meters) {
    return 'Радіус: $meters м';
  }

  @override
  String get tapMapToPlace => 'Торкніться карти, щоб поставити центр зони';

  @override
  String get notifyEnter => 'Сповіщати про вхід';

  @override
  String get notifyExit => 'Сповіщати про вихід';

  @override
  String get noZones =>
      'Додайте дім, школу чи секцію, щоб отримувати сповіщення, коли дитина приходить і йде';

  @override
  String get childWelcomeTitle => 'Привіт! Тут батьки зможуть бачити, де ти';

  @override
  String get consentTitle => 'Що бачать батьки';

  @override
  String get consentBody =>
      'Після під\'єднання батьки бачитимуть, де знаходиться цей телефон, заряд батареї та історію переміщень за останні дні.\n\nНа телефоні завжди видно, що геолокація передається. Ти бачиш, хто саме має доступ, і можеш від\'єднатися в налаштуваннях: батьки отримають про це сповіщення.';

  @override
  String get consentAccept => 'Зрозуміло, погоджуюся';

  @override
  String get enterCode => 'Код від батьків';

  @override
  String get scanQr => 'Сканувати QR-код';

  @override
  String get connect => 'Під\'єднатися';

  @override
  String get inviteInvalid =>
      'Код неправильний або застарів. Попроси батьків створити новий.';

  @override
  String get permissionTitle => 'Дозвіл на геолокацію';

  @override
  String get permissionBody =>
      'Щоб батьки бачили, де ти, навіть коли застосунок закритий, обери «Дозволяти завжди».';

  @override
  String get permissionGrant => 'Надати дозвіл';

  @override
  String get permissionSettings => 'Відкрити налаштування';

  @override
  String get permissionWhileInUse =>
      'Зараз геолокація передається лише коли застосунок відкритий. Для роботи у фоні дозволь «Завжди».';

  @override
  String get locationServiceOff =>
      'Геолокацію на телефоні вимкнено. Увімкни її в налаштуваннях.';

  @override
  String get parentsSee => 'Твою геолокацію бачать';

  @override
  String get sharingOn => 'Геолокація передається';

  @override
  String pendingPoints(int count) {
    return 'Немає інтернету. Збережено точок: $count';
  }

  @override
  String get sendLocation => 'Надіслати, де я';

  @override
  String get sent => 'Надіслано';

  @override
  String get sosHold => 'Утримуй 3 секунди';

  @override
  String sosCountdown(int seconds) {
    return 'SOS через $seconds…';
  }

  @override
  String get sosSent => 'SOS надіслано. Батьки отримали сигнал.';

  @override
  String sosAckByChild(String name) {
    return '$name бачить твій сигнал';
  }

  @override
  String get sosCancel => 'Скасувати тривогу';

  @override
  String get sosSmsFallback => 'Немає інтернету. Надіслати SMS батькам?';

  @override
  String get sendSms => 'Надіслати SMS';

  @override
  String sosSmsText(String link) {
    return 'SOS! Мені потрібна допомога. Я тут: $link';
  }

  @override
  String get pauseHour => 'Призупинити на 1 годину';

  @override
  String pausedUntil(String time) {
    return 'Передачу призупинено до $time';
  }

  @override
  String get resume => 'Відновити';

  @override
  String get leaveFamily => 'Від\'єднатися від сім\'ї';

  @override
  String get leaveConfirm =>
      'Батьки отримають сповіщення, а історію переміщень буде видалено. Продовжити?';

  @override
  String get leave => 'Від\'єднатися';

  @override
  String get trackingNoticeTitle => 'Де мої діти';

  @override
  String get trackingNoticeText => 'Геолокація передається батькам';

  @override
  String get trackingChannel => 'Передача геолокації';

  @override
  String get settings => 'Налаштування';

  @override
  String get language => 'Мова';

  @override
  String get exportData => 'Експортувати мої дані';

  @override
  String get deleteAccount => 'Видалити акаунт';

  @override
  String get deleteAccountConfirm =>
      'Буде видалено акаунт, сім\'ю, дітей і всю історію переміщень. Це не можна скасувати.';
}
