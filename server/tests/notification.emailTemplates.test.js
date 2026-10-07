const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildNotificationEmail: build, escapeHtml } = require("../src/modules/notifications/notificationEmailTemplates");
const { NOTIFICATION_TYPES: TYPES } = require("../src/constants/notificationTypes");

test("all supported events produce text and HTML with the expected subjects", () => {
  for (const [type, suffix, context] of [
    [TYPES.TICKET_CREATED, "Ticket SUP-123 created"],
    [TYPES.TICKET_ASSIGNED, "Ticket SUP-123 assigned to you"],
    [TYPES.TICKET_REASSIGNED, "Ticket SUP-123 reassigned to you", { reassignmentDirection: "TO_YOU" }],
    [TYPES.TICKET_REASSIGNED, "Ticket SUP-123 reassigned", { reassignmentDirection: "AWAY_FROM_YOU" }],
    [TYPES.TICKET_UNASSIGNED, "Ticket SUP-123 unassigned"],
    [TYPES.STATUS_CHANGED, "Ticket SUP-123 status updated", { statusLabel: "In Progress" }],
    [TYPES.PUBLIC_COMMENT, "New reply on SUP-123", { commentContext: "EMPLOYEE_REPLY" }],
    [TYPES.PUBLIC_COMMENT, "New support reply on SUP-123", { commentContext: "SUPPORT_REPLY" }],
    [TYPES.INTERNAL_NOTE, "New internal note on SUP-123"],
    [TYPES.TICKET_RESOLVED, "Ticket SUP-123 resolved"],
    [TYPES.TICKET_REOPENED, "Ticket SUP-123 reopened"],
    [TYPES.TICKET_CLOSED, "Ticket SUP-123 closed"],
  ]) {
    const input = Object.freeze({ type, ticketNumber: " SUP-123 ", recipientName: "Sam", ticketTitle: "VPN issue", ...context });
    const result = build(input);
    assert.deepEqual(Object.keys(result), ["subject", "text", "html"]);
    assert.equal(result.subject, `[SupportFlow] ${suffix}`);
    assert.match(result.text, /Hello Sam,/);
    assert.match(result.text, /Ticket: VPN issue/);
    assert.match(result.html, /SupportFlow/);
    assert.deepEqual(build(input), result);
  }
});

test("dynamic HTML is escaped and unused caller content never appears", () => {
  const unsafe = `&<>"'`;
  const escaped = "&amp;&lt;&gt;&quot;&#39;";
  assert.equal(escapeHtml(unsafe), escaped);
  const result = build({ type: TYPES.STATUS_CHANGED, ticketNumber: unsafe, recipientName: unsafe,
    ticketTitle: unsafe, statusLabel: unsafe, html: "<script>secret</script>", actorName: "secret",
    commentContent: "secret", resolutionSummary: "secret" });
  assert.equal(result.html.split(escaped).length - 1, 4);
  assert.doesNotMatch(result.html, /secret|<script|<iframe|<img|<link/);
  assert.ok(result.text.includes(unsafe));
  assert.doesNotMatch(build({ type: TYPES.TICKET_CREATED, ticketNumber: "SUP\r\nInjected" }).subject, /[\r\n]/);
});

test("missing context and unsupported types fail clearly; optional fields can be omitted", () => {
  for (const input of [{}, { type: TYPES.TICKET_CREATED }, { type: "UNKNOWN", ticketNumber: "SUP" },
    { type: TYPES.STATUS_CHANGED, ticketNumber: "SUP" },
    { type: TYPES.TICKET_REASSIGNED, ticketNumber: "SUP", reassignmentDirection: "OTHER" },
    { type: TYPES.PUBLIC_COMMENT, ticketNumber: "SUP", commentContext: "OTHER" },
    { type: TYPES.SLA_WARNING, ticketNumber: "SUP" }]) {
    assert.throws(() => build(input), { statusCode: 422 });
  }
  const result = build({ type: TYPES.INTERNAL_NOTE, ticketNumber: "SUP" });
  assert.match(result.text, /Hello there,/);
  assert.doesNotMatch(result.text, /undefined|null/);
});

test("XSS payloads remain text in every notification email template", () => {
  const payload = `<script>alert(1)</script><img src=x onerror="alert(1)"><svg onload="alert(1)"><a href="javascript:alert(1)">click</a>`;
  const legitimate = "O'Connor C++ <5 minutes A & B\nconst answer = 42; https://example.test";
  for (const type of [TYPES.TICKET_CREATED, TYPES.TICKET_ASSIGNED, TYPES.TICKET_REASSIGNED,
    TYPES.TICKET_UNASSIGNED, TYPES.STATUS_CHANGED, TYPES.PUBLIC_COMMENT, TYPES.INTERNAL_NOTE,
    TYPES.TICKET_RESOLVED, TYPES.TICKET_REOPENED, TYPES.TICKET_CLOSED]) {
    const result = build({ type, ticketNumber: payload, recipientName: payload,
      ticketTitle: legitimate, statusLabel: payload, reassignmentDirection: "TO_YOU",
      commentContext: "EMPLOYEE_REPLY" });
    assert.ok(result.html.includes(escapeHtml(payload)));
    // Existing email context is single-line; preserve its normalization contract.
    assert.ok(result.html.includes(escapeHtml(legitimate.replace(/\n/g, " "))));
    assert.doesNotMatch(result.html, /<script|<img|<svg|<a\s/i);
    assert.ok(result.text.includes(payload));
    assert.ok(result.text.includes(legitimate.replace(/\n/g, " ")));
  }
});
