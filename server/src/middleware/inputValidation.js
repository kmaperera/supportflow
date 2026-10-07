const { body, query } = require('express-validator');

// Preserve decimal BIGINT strings; never round IDs through Number().
function positiveId(value) {
  if (!['string', 'number'].includes(typeof value) ||
      (typeof value === 'number' && !Number.isSafeInteger(value))) return false;
  const text = String(value);
  return /^[1-9]\d*$/.test(text) && text.length <= 20 && BigInt(text) <= 18446744073709551615n;
}

function bodyFields(fields, { optional = false } = {}) {
  return body().custom(value => (optional && value === undefined) ||
    (value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).every(key => fields.includes(key))))
    .withMessage(fields.length ? `Only ${fields.join(', ')} may be provided` : 'Request body must be empty');
}

function queryFields(fields) {
  return query().custom(value => Object.keys(value).every(key => fields.includes(key)))
    .withMessage(fields.length ? `Only ${fields.join(', ')} query parameters are supported` : 'Query parameters are not supported');
}

function pagination(defaultLimit = 20) {
  return [
    query('page').optional().custom(value => positiveId(value) && Number.isSafeInteger(Number(value)))
      .withMessage('Page must be a positive integer'),
    query('limit').optional().custom(value => positiveId(value) && Number(value) <= 100)
      .withMessage('Limit must be between 1 and 100'),
    query().custom(value => {
      const page = value.page === undefined ? 1 : Number(value.page);
      const limit = value.limit === undefined ? defaultLimit : Number(value.limit);
      return Number.isSafeInteger(page * limit);
    }).withMessage('Pagination exceeds the supported range'),
  ];
}

const emptyBody = () => bodyFields([], { optional: true });
// Input resource limit, not a change to password complexity or hashing policy.
const MAX_PASSWORD_LENGTH = 1024;
module.exports = { positiveId, bodyFields, queryFields, pagination, emptyBody, MAX_PASSWORD_LENGTH };
