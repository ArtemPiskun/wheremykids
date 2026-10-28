import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServiceAccount } from '../src/notify/push.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

test('ключ Firebase: перевірка типу й проєкту', async () => {
  const ok = { type: 'service_account', project_id: 'my-kids-1f72d', client_email: 'x@y' };
  assert.equal((await loadServiceAccount({ firebaseCredentialsBase64: b64(ok), firebaseProjectId: 'my-kids-1f72d' })).project_id, 'my-kids-1f72d');
  assert.equal(await loadServiceAccount({}), null);
  await assert.rejects(loadServiceAccount({ firebaseCredentialsBase64: b64({ ...ok, project_id: 'other' }), firebaseProjectId: 'my-kids-1f72d' }), /other/);
  // google-services.json замість ключа — типова плутанина
  await assert.rejects(loadServiceAccount({ firebaseCredentialsBase64: b64({ project_info: {} }) }), /сервісного акаунта/);
});
