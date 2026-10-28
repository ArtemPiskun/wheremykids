// Відправлення пушів. У продакшні — Firebase Cloud Messaging,
// без ключа — лише лог (зручно для локальної розробки й тестів).

export function memoryNotifier() {
  const sent = [];
  return {
    sent,
    async send(tokens, message) {
      for (const token of tokens) sent.push({ token, ...message });
    },
  };
}

export function logNotifier(log = console) {
  return {
    async send(tokens, message) {
      if (tokens.length) log.info({ tokens: tokens.length, ...message }, 'push (FCM не налаштовано)');
    },
  };
}

export async function fcmNotifier(credentialsPath) {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  const { readFile } = await import('node:fs/promises');
  const app = initializeApp({ credential: cert(JSON.parse(await readFile(credentialsPath, 'utf8'))) });
  const messaging = getMessaging(app);
  return {
    async send(tokens, { title, body, data = {}, urgent = false }) {
      if (!tokens.length) return;
      // Усі значення data у FCM мають бути рядками
      const strData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
      await messaging.sendEachForMulticast({
        tokens,
        notification: title ? { title, body } : undefined,
        data: strData,
        android: {
          priority: 'high',
          notification: title ? { channelId: urgent ? 'alerts' : 'default', sound: 'default' } : undefined,
        },
      });
    },
  };
}
