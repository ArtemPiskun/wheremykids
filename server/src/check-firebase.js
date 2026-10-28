// Перевірка ключа Firebase: npm run check-firebase
// Читає ключ так само, як сервер, і пробує отримати токен доступу Google.
import { cert } from 'firebase-admin/app';
import { loadConfig } from './config.js';
import { loadServiceAccount } from './notify/push.js';

try {
  const account = await loadServiceAccount(loadConfig());
  if (!account) {
    console.error('Ключ не задано: вкажіть GOOGLE_APPLICATION_CREDENTIALS або FIREBASE_SERVICE_ACCOUNT_BASE64');
    process.exit(1);
  }
  await cert(account).getAccessToken();
  console.log(`Ключ робочий: проєкт ${account.project_id}, акаунт ${account.client_email}`);
} catch (err) {
  console.error(`Ключ не підходить: ${err.message}`);
  process.exit(1);
}
