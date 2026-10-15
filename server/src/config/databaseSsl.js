const { createSecureContext } = require('node:tls');
const { X509Certificate } = require('node:crypto');

function databaseSsl(env = process.env) {
  const enabled = env.DB_SSL ?? 'false';
  if (!['true', 'false'].includes(enabled)) throw new Error('DB_SSL must be true or false');
  const configuredCa = env.DB_SSL_CA;
  if (configuredCa && enabled !== 'true') throw new Error('DB_SSL_CA requires DB_SSL=true');
  if (enabled === 'false') return undefined;
  const ssl = { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' };
  if (configuredCa) {
    const ca = configuredCa.replace(/\\n/g, '\n');
    try {
      const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
      if (!certificates?.length || ca.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()) throw new Error();
      for (const certificate of certificates) new X509Certificate(certificate);
      createSecureContext({ ca });
    } catch {
      throw new Error('DB_SSL_CA must contain valid PEM CA certificates');
    }
    ssl.ca = ca;
  }
  return ssl;
}

module.exports = { databaseSsl };
