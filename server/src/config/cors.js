function clientOrigin(env = process.env) {
  const configured = env.CLIENT_URL?.trim();
  if (!configured && env.NODE_ENV !== "production") return "http://localhost:5173";
  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash || url.hostname.includes("*")) throw new Error();
    return url.origin;
  } catch {
    throw new Error("CLIENT_URL must be a valid HTTP(S) frontend origin without credentials, path, query or fragment");
  }
}

function corsPolicy(env = process.env) {
  const allowed = clientOrigin(env);
  const isAllowed = origin => origin === undefined || origin === allowed;
  const origin = (value, callback) => callback(null, value === allowed ? allowed : false);
  return {
    rest: {
      origin, credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["Content-Disposition"],
      optionsSuccessStatus: 204,
    },
    socket: {
      cors: { origin, credentials: true, methods: ["GET", "POST"] },
      // WebSocket handshakes need an explicit origin check in addition to CORS.
      allowRequest: (req, callback) => callback(null, isAllowed(req.headers.origin)),
    },
  };
}

module.exports = { clientOrigin, corsPolicy };
