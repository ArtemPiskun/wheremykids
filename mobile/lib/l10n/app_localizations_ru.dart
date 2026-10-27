// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Russian (`ru`).
class SRu extends S {
  SRu([String locale = 'ru']) : super(locale);

  @override
  String get appTitle => 'Где мои дети';

  @override
  String get childAppTitle => 'Где мои дети: Ребёнок';

  @override
  String get retry => 'Повторить';

  @override
  String get cancel => 'Отмена';

  @override
  String get save => 'Сохранить';

  @override
  String get delete => 'Удалить';

  @override
  String get create => 'Создать';

  @override
  String get next => 'Далее';

  @override
  String get errorNetwork =>
      'Нет подключения к интернету. Данные обновятся, когда связь вернётся.';

  @override
  String get errorGeneric => 'Что-то пошло не так. Попробуйте ещё раз.';

  @override
  String get signIn => 'Войти';

  @override
  String get signUp => 'Создать аккаунт';

  @override
  String get email => 'Электронная почта';

  @override
  String get password => 'Пароль';

  @override
  String get passwordHint => 'Не менее 10 символов';

  @override
  String get yourName => 'Ваше имя';

  @override
  String get acceptPrivacy => 'Я принимаю политику конфиденциальности';

  @override
  String get haveAccount => 'Уже есть аккаунт? Войти';

  @override
  String get noAccount => 'Нет аккаунта? Зарегистрироваться';

  @override
  String get invalidCredentials => 'Неверная почта или пароль';

  @override
  String get emailTaken => 'Аккаунт с этой почтой уже существует';

  @override
  String get invalidEmail => 'Проверьте адрес почты';

  @override
  String get tooManyAttempts => 'Слишком много попыток. Подождите минуту.';

  @override
  String get logout => 'Выйти';

  @override
  String get createFamilyTitle => 'Создайте семью';

  @override
  String get familyName => 'Название семьи';

  @override
  String get familyNameHint => 'Например, Коваленко';

  @override
  String get addChild => 'Добавить ребёнка';

  @override
  String get childName => 'Имя ребёнка';

  @override
  String get birthYear => 'Год рождения';

  @override
  String get childPhone => 'Номер телефона ребёнка';

  @override
  String get phoneHint => '+380 67 123 45 67';

  @override
  String get invalidPhone => 'Введите номер в формате +380 67 123 45 67';

  @override
  String get planLimit =>
      'Лимит тарифа исчерпан. Перейдите на Премиум, чтобы добавить больше.';

  @override
  String get inviteTitle => 'Подключите телефон ребёнка';

  @override
  String get inviteSteps =>
      '1. Установите «Где мои дети: Ребёнок» на телефон ребёнка.\n2. Отсканируйте QR-код или введите код.';

  @override
  String inviteExpires(String time) {
    return 'Код действует до $time';
  }

  @override
  String get newCode => 'Новый код';

  @override
  String get statusOnline => 'онлайн';

  @override
  String get statusRecent => 'недавно';

  @override
  String get statusOffline => 'нет связи';

  @override
  String get statusPaused => 'пауза';

  @override
  String get justNow => 'только что';

  @override
  String minutesAgo(int count) {
    return '$count мин назад';
  }

  @override
  String hoursAgo(int count) {
    return '$count ч назад';
  }

  @override
  String get history => 'История';

  @override
  String get call => 'Позвонить';

  @override
  String get updateNow => 'Обновить сейчас';

  @override
  String get updateRequested => 'Запрос отправлен на телефон ребёнка';

  @override
  String get notConnected => 'Не подключено';

  @override
  String get connectPhone => 'Подключить телефон';

  @override
  String get noLocationYet => 'Пока нет геолокации';

  @override
  String dataAsOf(String time) {
    return 'Нет связи. Данные на $time';
  }

  @override
  String get zones => 'Зоны';

  @override
  String get noChildren => 'Добавьте ребёнка, чтобы видеть его на карте';

  @override
  String accuracy(int meters) {
    return 'точность $meters м';
  }

  @override
  String sosTitle(String name) {
    return '$name: SOS!';
  }

  @override
  String sosAt(String time) {
    return 'Сигнал в $time';
  }

  @override
  String sosBattery(int level) {
    return 'Батарея $level%';
  }

  @override
  String get sosAck => 'Вижу, уже действую';

  @override
  String get sosResolve => 'Решено';

  @override
  String sosAcknowledgedBy(String name) {
    return '$name подтверждает';
  }

  @override
  String get sosCall112 => 'Вызвать 112';

  @override
  String get sosCall112Confirm =>
      'Позвонить на 112? Это экстренная линия: звоните только при реальной опасности.';

  @override
  String get yesCall => 'Да, звонить';

  @override
  String get no => 'Нет';

  @override
  String get sosRoute => 'Маршрут за последние 30 мин';

  @override
  String get sosNoLocation =>
      'Координаты ещё не получены, показано последнее известное место';

  @override
  String get historyTitle => 'История перемещений';

  @override
  String get today => 'Сегодня';

  @override
  String get yesterday => 'Вчера';

  @override
  String get noPoints => 'За этот период нет точек';

  @override
  String get historyLimited =>
      'На бесплатном тарифе доступна история за 24 часа';

  @override
  String get zonesTitle => 'Безопасные зоны';

  @override
  String get addZone => 'Добавить зону';

  @override
  String get zoneHome => 'Дом';

  @override
  String get zoneSchool => 'Школа';

  @override
  String get zoneSport => 'Спортзал';

  @override
  String get zoneOther => 'Другое';

  @override
  String get zoneName => 'Название зоны';

  @override
  String radius(int meters) {
    return 'Радиус: $meters м';
  }

  @override
  String get tapMapToPlace => 'Нажмите на карту, чтобы поставить центр зоны';

  @override
  String get notifyEnter => 'Уведомлять о входе';

  @override
  String get notifyExit => 'Уведомлять о выходе';

  @override
  String get noZones =>
      'Добавьте дом, школу или секцию, чтобы получать уведомления о приходе и уходе';

  @override
  String get childWelcomeTitle =>
      'Привет! Здесь родители смогут видеть, где ты';

  @override
  String get consentTitle => 'Что видят родители';

  @override
  String get consentBody =>
      'После подключения родители будут видеть, где находится этот телефон, заряд батареи и историю перемещений за последние дни.\n\nНа телефоне всегда видно, что геолокация передаётся. Ты видишь, у кого есть доступ, и можешь отключиться в настройках: родители получат уведомление.';

  @override
  String get consentAccept => 'Понятно, согласен(на)';

  @override
  String get enterCode => 'Код от родителей';

  @override
  String get scanQr => 'Сканировать QR-код';

  @override
  String get connect => 'Подключиться';

  @override
  String get inviteInvalid =>
      'Код неверный или устарел. Попроси родителей создать новый.';

  @override
  String get permissionTitle => 'Разрешение на геолокацию';

  @override
  String get permissionBody =>
      'Чтобы родители видели, где ты, даже когда приложение закрыто, выбери «Разрешать всегда».';

  @override
  String get permissionGrant => 'Дать разрешение';

  @override
  String get permissionSettings => 'Открыть настройки';

  @override
  String get permissionWhileInUse =>
      'Сейчас геолокация передаётся только когда приложение открыто. Для работы в фоне разреши «Всегда».';

  @override
  String get locationServiceOff =>
      'Геолокация на телефоне выключена. Включи её в настройках.';

  @override
  String get parentsSee => 'Твою геолокацию видят';

  @override
  String get sharingOn => 'Геолокация передаётся';

  @override
  String pendingPoints(int count) {
    return 'Нет интернета. Сохранено точек: $count';
  }

  @override
  String get sendLocation => 'Отправить, где я';

  @override
  String get sent => 'Отправлено';

  @override
  String get sosHold => 'Удерживай 3 секунды';

  @override
  String sosCountdown(int seconds) {
    return 'SOS через $seconds…';
  }

  @override
  String get sosSent => 'SOS отправлен. Родители получили сигнал.';

  @override
  String sosAckByChild(String name) {
    return '$name видит твой сигнал';
  }

  @override
  String get sosCancel => 'Отменить тревогу';

  @override
  String get sosSmsFallback => 'Нет интернета. Отправить SMS родителям?';

  @override
  String get sendSms => 'Отправить SMS';

  @override
  String sosSmsText(String link) {
    return 'SOS! Мне нужна помощь. Я здесь: $link';
  }

  @override
  String get pauseHour => 'Приостановить на 1 час';

  @override
  String pausedUntil(String time) {
    return 'Передача приостановлена до $time';
  }

  @override
  String get resume => 'Возобновить';

  @override
  String get leaveFamily => 'Отключиться от семьи';

  @override
  String get leaveConfirm =>
      'Родители получат уведомление, а история перемещений будет удалена. Продолжить?';

  @override
  String get leave => 'Отключиться';

  @override
  String get trackingNoticeTitle => 'Где мои дети';

  @override
  String get trackingNoticeText => 'Геолокация передаётся родителям';

  @override
  String get trackingChannel => 'Передача геолокации';

  @override
  String get settings => 'Настройки';

  @override
  String get language => 'Язык';

  @override
  String get exportData => 'Экспортировать мои данные';

  @override
  String get deleteAccount => 'Удалить аккаунт';

  @override
  String get deleteAccountConfirm =>
      'Будут удалены аккаунт, семья, дети и вся история перемещений. Это нельзя отменить.';
}
