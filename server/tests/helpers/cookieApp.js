// Isolated fixture: actual auth/rotation/JWT code, in-memory persistence only.
async function cookieApp() {
  const crypto = require("node:crypto");
  Object.assign(process.env, {
    NODE_ENV: "test", CLIENT_URL: "http://localhost:5197", LOGIN_RATE_LIMIT_MAX: "5",
    JWT_ACCESS_SECRET: crypto.randomBytes(32).toString("hex"), JWT_REFRESH_SECRET: crypto.randomBytes(32).toString("hex"),
    JWT_ACCESS_EXPIRES_IN: "15m", JWT_REFRESH_EXPIRES_IN: "7d",
    CLOUDINARY_CLOUD_NAME: "fixture", CLOUDINARY_API_KEY: "fixture", CLOUDINARY_API_SECRET: "fixture",
  });
  const user = { id: 1, email: "cookie@example.com", first_name: "Cookie", last_name: "Fixture", role: "EMPLOYEE", is_active: 1,
    password_hash: await require("../../src/utils/password").hashPassword("CookieFixture123!") };
  const users = require("../../src/modules/users/user.repository");
  users.findByEmail = async email => email === user.email ? user : email === "inactive@example.com" ? { ...user, is_active: 0 } : null;
  users.findById = async () => user;
  users.updateLastLogin = async () => {};
  const records = [];
  const repository = require("../../src/modules/auth/refreshToken.repository");
  repository.create = async ({ userId, tokenHash, expiresAt }) => {
    records.push({ id: records.length + 1, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked_at: null });
    return records.length;
  };
  repository.findActiveByHash = async hash => records.find(row => row.token_hash === hash && !row.revoked_at && row.expires_at > new Date()) || null;
  repository.revokeById = async id => {
    const row = records.find(row => row.id === id && !row.revoked_at);
    if (!row) return 0;
    row.revoked_at = new Date(); return 1;
  };
  repository.revokeAllForUser = async id => {
    let count = 0;
    for (const row of records) if (String(row.user_id) === String(id) && !row.revoked_at) { row.revoked_at = new Date(); count++; }
    return count;
  };
  return { app: require("../../src/app"), records };
}
module.exports = cookieApp;

if (require.main === module) cookieApp().then(({ app }) => {
  app.listen(5097, () => console.log("Cookie fixture API ready on 5097"));
  require("node:http").createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><title>Cookie regression fixture</title><h1>Cookie regression fixture</h1>");
  }).listen(5197);
});
