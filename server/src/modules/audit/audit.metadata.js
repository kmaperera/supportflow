const MAX_METADATA_BYTES = 16 * 1024;
const MAX_DEPTH = 8;
const MAX_NODES = 1024;
const secretKey = key => /password|passwd|passphrase|secret|token|authorization|cookie|credential|privatekey|apikey|jwt|sessionid|^(smtppass|dbpass)$/.test(key);
const blockedKeys = new Set(['__proto__', 'constructor', 'prototype', 'headers', 'body', 'rawbody', 'request', 'response', 'req', 'res', 'config', 'env']);

function invalid() { throw new TypeError('Invalid audit metadata'); }
function isPlainObject(value) {
  return value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

// Copy deliberately constructed JSON data; never invoke getters or toJSON.
// Secret keys are removed recursively, including inside arrays. Callers must
// still avoid putting credentials/private content under innocuous field names.
function sanitizeMetadata(metadata) {
  if (metadata == null) return null;
  if (!isPlainObject(metadata)) invalid();
  const ancestors = new Set();
  let nodes = 0;
  let bytes = 0;
  const consume = value => {
    bytes += Buffer.byteLength(value, 'utf8');
    if (bytes > MAX_METADATA_BYTES) invalid();
  };
  function visit(value, depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) invalid();
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) invalid(); return value; }
    if (typeof value === 'string') { consume(value); return value; }
    if (typeof value !== 'object' || (!Array.isArray(value) && !isPlainObject(value))) invalid();
    if (ancestors.has(value)) invalid();
    // Plain copies of HTTP requests are also rejected, not captured wholesale.
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > MAX_NODES || keys.some(key => typeof key !== 'string')) invalid();
    if (!Array.isArray(value)) {
      const has = key => Object.hasOwn(descriptors, key);
      if (['socket', 'connection', 'httpVersion', 'rawHeaders', 'originalUrl', 'dataValues', '_previousDataValues', 'sequelize'].some(has) ||
          (has('method') && has('url') && (has('headers') || has('body'))) ||
          (has('id') && (has('password_hash') || (has('created_at') && has('updated_at'))))) invalid();
    }
    ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      if (value.length > MAX_NODES || keys.some(key => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) invalid();
      result = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = descriptors[i];
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid();
        result.push(visit(descriptor.value, depth + 1));
      }
    } else {
      result = {};
      for (const key of keys) {
        const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (blockedKeys.has(key.toLowerCase()) || blockedKeys.has(normalized) || secretKey(normalized)) continue;
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || key.length > 100) invalid();
        consume(key);
        result[key] = visit(descriptor.value, depth + 1);
      }
    }
    ancestors.delete(value);
    return result;
  }
  const result = visit(metadata, 0);
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_METADATA_BYTES) invalid();
  return Object.keys(result).length ? result : null;
}

module.exports = { sanitizeMetadata, isPlainObject, MAX_METADATA_BYTES };
