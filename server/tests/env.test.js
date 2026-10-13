const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateEnvironment, validateMailConfiguration } = require("../src/config/env");

test("startup validates secrets before SDK loading, without disclosing values", () => {
  const saved = { ...process.env };
  try {
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, {
      NODE_ENV: "test", DB_HOST: "localhost", DB_USER: "fake-user", DB_PASSWORD: " fake password ", DB_NAME: "fake_db",
      JWT_ACCESS_SECRET: "test-only-access", JWT_REFRESH_SECRET: "test-only-refresh", JWT_ACCESS_EXPIRES_IN: "15m", JWT_REFRESH_EXPIRES_IN: "7d",
      CLOUDINARY_CLOUD_NAME: "fake-cloud", CLOUDINARY_API_KEY: "fake-key", CLOUDINARY_API_SECRET: "fake-secret",
    });
    assert.doesNotThrow(validateEnvironment);
    assert.equal(process.env.DB_PASSWORD, " fake password ");
    delete process.env.DB_PASSWORD;
    assert.throws(validateEnvironment, /DB_PASSWORD/);
    process.env.DB_PASSWORD = "your_database_password";
    assert.throws(validateEnvironment, /Replace environment placeholders: DB_PASSWORD/);
    process.env.DB_PASSWORD = "test-password";
    process.env.SMTP_USER = "fake@example.test";
    assert.throws(validateEnvironment, /SMTP_HOST/);
    delete process.env.SMTP_USER;
    process.env.NODE_ENV = "production";
    assert.throws(validateEnvironment, /Production JWT secrets/);
    process.env.JWT_ACCESS_SECRET = "test-only-access-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    process.env.JWT_REFRESH_SECRET = "test-only-refresh-abcdefghijklmnopqrstuvwxyz0123456789";
    process.env.CLIENT_URL = "https://example.test";
    assert.doesNotThrow(validateEnvironment);
    process.env.DB_PORT = "not-a-port";
    assert.throws(validateEnvironment, /DB_PORT must/);
  } finally {
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, saved);
  }
});

test("mail validation preserves passwords and rejects invalid configuration", () => {
  const env = { SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "fake@example.test", SMTP_PASS: " fake password ", EMAIL_FROM_ADDRESS: "fake@example.test" };
  assert.doesNotThrow(() => validateMailConfiguration(env));
  assert.equal(env.SMTP_PASS, " fake password ");
  assert.throws(() => validateMailConfiguration({ ...env, SMTP_SECURE: "invalid" }), /SMTP_SECURE/);
});

test("request logger excludes URL credentials, query strings and headers", async () => {
  const express = require("express");
  const morgan = require("morgan");
  require("../src/utils/logger");
  const lines = [];
  const app = express();
  app.use(morgan(":method :safe-path :status :response-time ms", { stream: { write: line => lines.push(line) } }));
  app.get("/probe", (req, res) => res.sendStatus(200));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    await fetch(`http://127.0.0.1:${server.address().port}/probe?token=test-only-sensitive-value`, { headers: { Authorization: "Bearer test-only-sensitive-value", Cookie: "session=test-only-sensitive-value" } });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /GET \/probe 200/);
    assert.ok(!lines[0].includes("test-only-sensitive-value"));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
