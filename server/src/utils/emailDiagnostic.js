// Never serialize provider error objects, responses, addresses or raw messages.
// Fixed vocabularies prevent an unexpected field from carrying credentials.
const messages = {
  EAUTH: 'SMTP authentication failed',
  ETIMEDOUT: 'SMTP connection or response timed out',
  ECONNECTION: 'SMTP connection failed',
  ECONNREFUSED: 'SMTP connection refused',
  ECONNRESET: 'SMTP connection reset',
  EDNS: 'SMTP hostname resolution failed',
  ENOTFOUND: 'SMTP hostname resolution failed',
  EAI_AGAIN: 'SMTP hostname resolution temporarily failed',
  ESOCKET: 'SMTP socket or TLS failure',
  ETLS: 'SMTP TLS negotiation failed',
  EENVELOPE: 'SMTP sender or recipient rejected',
  EMESSAGE: 'SMTP message rejected',
  CERT_HAS_EXPIRED: 'SMTP certificate expired',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'SMTP certificate verification failed',
  ERR_TLS_CERT_ALTNAME_INVALID: 'SMTP certificate hostname mismatch',
};
function logEmailFailure(stage, error) {
  const diagnostic = {
    stage: ['configuration', 'send', 'verify'].includes(stage) ? stage : 'unknown',
    name: ['Error', 'TypeError', 'ApiError'].includes(error?.name) ? error.name : 'Error',
    code: Object.hasOwn(messages, error?.code) ? error.code : 'UNKNOWN',
    message: Object.hasOwn(messages, error?.code) ? messages[error.code] : 'Email operation failed',
  };
  if (Number.isInteger(error?.responseCode) && error.responseCode >= 200 && error.responseCode <= 599) {
    diagnostic.responseCode = error.responseCode;
  }
  if (['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH', 'AUTH LOGIN', 'AUTH PLAIN', 'MAIL FROM', 'RCPT TO', 'DATA', 'QUIT'].includes(error?.command)) {
    diagnostic.command = error.command;
  }
  console.error('Email operation failed', diagnostic);
}
module.exports = { logEmailFailure };
