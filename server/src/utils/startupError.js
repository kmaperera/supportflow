function logDevelopmentStartupError(error, env = process.env, log = console.error) {
  if (env.NODE_ENV && env.NODE_ENV !== 'development') return;
  let message = typeof error?.message === 'string' ? error.message : 'Unknown startup error';
  // Driver messages may include account names, hosts or submitted credentials.
  const values = Object.entries(env)
    .filter(([name, value]) => value && /PASSWORD|SECRET|TOKEN|SMTP_PASS|DB_HOST|DB_USER|DB_NAME|URL/i.test(name))
    .map(([, value]) => String(value)).sort((a, b) => b.length - a.length);
  for (const value of values) message = message.split(value).join('[redacted]');
  message = message.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, '[redacted URL]').replace(/[\r\n]/g, ' ');
  log('Startup error:', message.slice(0, 500));
  if (typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code)) log('Startup error code:', error.code);
}

module.exports = { logDevelopmentStartupError };
