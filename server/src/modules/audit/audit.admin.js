const service = require('./audit.service');

// Controllers pass only authenticated identity and Express-derived IP.
function contextFromRequest(req) {
  return { actorUserId: req.user.id, ipAddress: req.ip };
}

// Internal callers without an authenticated context (e.g. seeds) do not invent
// admin actors. Production mutation controllers always supply this context.
function record(context, action, entityType, entityId, metadata, connection) {
  if (!context) return Promise.resolve(null);
  return service.log({ actorUserId: context.actorUserId, ipAddress: context.ipAddress,
    action, entityType, entityId, metadata }, connection ? { connection, strict: true } : undefined);
}

module.exports = { contextFromRequest, record };
