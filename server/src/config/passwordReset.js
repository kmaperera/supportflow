function resetLifetime(env = process.env) {
  const value = env.PASSWORD_RESET_TTL_MINUTES ?? '15';
  if (!/^\d+$/.test(value) || Number(value) < 5 || Number(value) > 30) throw new Error('PASSWORD_RESET_TTL_MINUTES must be an integer between 5 and 30');
  return Number(value);
}
module.exports = { resetLifetime };
