const { test } = require("node:test");
const assert = require("node:assert/strict");
const socket = require("../src/config/socket");
const sent = [];
let fail = false;
socket.getIO = () => {
  if (fail) throw new Error("Sensitive socket details");
  return { to(room) { return { emit(event, payload) { sent.push({ room, event, payload }); } }; } };
};
const realtime = require("../src/modules/notifications/notificationRealtime.service");

test("safe mapped payloads route separately to each recipient; failures are best effort", (t) => {
  const warning = t.mock.method(console, "warn", () => {});
  const notification = { id: 1, userId: "7", ticketId: 5, commentId: null, type: "TICKET_REASSIGNED",
    title: "Ticket reassigned", message: "Assigned to you", isRead: false, readAt: null, createdAt: "now",
    password: "secret", fileUrl: "secret", user: { role: "ADMIN" } };
  assert.equal(realtime.emitNotifications([notification, { ...notification, id: 2, userId: "8" }]), true);
  assert.deepEqual(sent.map(item => item.room), ["user:7", "user:8"]);
  assert.ok(sent.every(item => item.event === "notification:new"));
  assert.deepEqual(Object.keys(sent[0].payload), ["id", "ticketId", "commentId", "type", "title", "message", "isRead", "readAt", "createdAt"]);
  assert.equal(realtime.emitNotifications([]), true);
  assert.equal(realtime.emitNotification({ ...notification, userId: "7/other" }), false);
  assert.equal(realtime.emitNotifications(null), false);
  assert.throws(() => realtime.buildRealtimeNotificationPayload({ user_id: 7 }));
  fail = true;
  assert.equal(realtime.emitNotification(notification), false);
  assert.equal(sent.length, 2);
  assert.ok(warning.mock.calls.every(call => call.arguments[0] === "Notification realtime delivery failed"));
});
