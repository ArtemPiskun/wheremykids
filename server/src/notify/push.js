// Відправлення пушів. У продакшні — Firebase Cloud Messaging,
// без ключа — лише лог (зручно для локальної розробки й тестів).

export function memoryNotifier() {
  const sent = [];
  return {
    sent,
    dead: new Set(),
    async send(tokens, message) {
      for (const token of tokens) sent.push({ token, ...message });
      return tokens.filter((t) => this.dead.has(t));
    },
  };
}

export function logNotifier(log = console) {
  return {
    async send(tokens, message) {
      if (tokens.length) log.info({ tokens: tokens.length, ...message }, 'push (FCM не налаштовано)');
      return [];
    },
  };
}

// Читає ключ сервісного акаунта з файлу або з base64-змінної й перевіряє проєкт
export async function loadServiceAccount({ firebaseCredentialsPath, firebaseCredentialsBase64, firebaseProjectId }) {
  let raw;
  if (firebaseCredentialsBase64) raw = Buffer.from(firebaseCredentialsBase64, 'base64').toString('utf8');
  else if (firebaseCredentialsPath) raw = await (await import('node:fs/promises')).readFile(firebaseCredentialsPath, 'utf8');
  else return null;
  const account = JSON.parse(raw);
  if (account.type !== 'service_account') throw new Error('Це не ключ сервісного акаунта Firebase (немає "type": "service_account")');
  if (firebaseProjectId && account.project_id !== firebaseProjectId) {
    throw new Error(`Ключ від проєкту ${account.project_id}, а очікується ${firebaseProjectId}`);
  }
  return account;
}

// Помилки FCM, після яких токен пристрою більше не дійсний
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export async function fcmNotifier(serviceAccount) {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  const app = initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
  const messaging = getMessaging(app);
  return {
    // Повертає токени, які FCM відхилив як недійсні (застосунок видалено тощо)
    async send(tokens, { title, body, data = {}, urgent = false }) {
      if (!tokens.length) return [];
      // Усі значення data у FCM мають бути рядками
      const strData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: title ? { title, body } : undefined,
        data: strData,
        android: {
          priority: 'high',
          notification: title ? { channelId: urgent ? 'alerts' : 'default', sound: 'default' } : undefined,
        },
      });
      return res.responses.flatMap((r, i) => (!r.success && DEAD_TOKEN_CODES.has(r.error?.code) ? [tokens[i]] : []));
    },
  };
}
