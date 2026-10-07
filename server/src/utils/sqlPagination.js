// Repository guard as well as HTTP validation: keep pagination scalar and bounded
// even when a repository is called directly. Values still use SQL placeholders.
function assertSqlPagination(limit, offset) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(offset + limit)) {
    throw new TypeError('Invalid SQL pagination');
  }
}

module.exports = assertSqlPagination;
