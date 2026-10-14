// TIMESTAMP columns represent instants, but MySQL exposes them in the session
// timezone. Convert UTC calendar boundaries to that timezone before comparing;
// keep the column bare so its creation-time index remains usable.
function utcBoundary() {
  // Services validate calendar dates; the repository still binds every value,
  // including malformed input, rather than interpolating it into SQL.
  // Out-of-range calendar bounds are already before/after every representable
  // TIMESTAMP. Keep that original bound when FROM_UNIXTIME returns NULL.
  return `(SELECT COALESCE(FROM_UNIXTIME(TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', utc_bound.utc_value)), utc_bound.utc_value) FROM (SELECT ? AS utc_value) AS utc_bound)`;
}

function utcTimestamp(column) {
  if (!/^(?:[a-z_]+\.)?[a-z_]+$/.test(column)) throw new TypeError('Invalid timestamp column');
  return `TIMESTAMPADD(SECOND, UNIX_TIMESTAMP(${column}), '1970-01-01 00:00:00')`;
}

module.exports = { utcBoundary, utcTimestamp };
