const { Server } = require("socket.io");
const { verifyAccessToken } = require("../utils/jwt");
const userRepository = require("../modules/users/user.repository");
const { USER_ROLES } = require("../constants/roles");

let io;
let httpServer;

function initializeSocket(server) {
  if (io) {
    if (server !== httpServer) throw new Error("Socket.IO is already initialized on another server");
    return io;
  }
  const origin = process.env.CLIENT_URL?.trim();
  if (!origin || origin === "*") throw new Error("CLIENT_URL must specify the client origin for Socket.IO");
  io = new Server(server, { cors: { origin, credentials: true } });
  httpServer = server;

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token.trim()) throw new Error("Missing token");
      const decoded = verifyAccessToken(token);
      const userId = decoded.sub;
      if (typeof userId !== "string" || !/^[1-9]\d*$/.test(userId) ||
          userId.length > 20 || BigInt(userId) > 18446744073709551615n) {
        throw new Error("Invalid identity");
      }
      const user = await userRepository.findById(userId);
      if (!user || ![true, 1, "1"].includes(user.is_active) ||
          String(user.id) !== userId || !Object.values(USER_ROLES).includes(user.role)) {
        throw new Error("Unavailable user");
      }
      socket.user = { id: user.id, role: user.role };
    } catch {
      return next(new Error("Authentication error"));
    }
    return next();
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.user.id}`);
    if (process.env.NODE_ENV === "development") console.log(`Socket connected: user ${socket.user.id}`);
    socket.on("disconnect", () => {
      if (process.env.NODE_ENV === "development") console.log(`Socket disconnected: user ${socket.user.id}`);
    });
  });
  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.IO has not been initialized");
  return io;
}

module.exports = { initializeSocket, getIO };
