// Prints fresh secrets for .env. Never commit the output.
const { randomBytes } = require('node:crypto');
const b64 = (n) => randomBytes(n).toString('base64');
console.log(`JWT_ACCESS_SECRET=${b64(48)}`);
console.log(`INVITE_PEPPER=${b64(32)}`);
console.log(`AUDIT_IP_SALT=${b64(24)}`);
console.log(`LOCATION_ENC_KEYS=1:${b64(32)}`);
console.log('LOCATION_ENC_ACTIVE_KEY=1');
