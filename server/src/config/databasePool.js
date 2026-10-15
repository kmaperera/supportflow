function poolLimit(env = process.env) {
  const value = env.DB_POOL_LIMIT ?? '5';
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 10) {
    throw new Error('DB_POOL_LIMIT must be an integer between 1 and 10');
  }
  return Number(value);
}
module.exports = { poolLimit };
