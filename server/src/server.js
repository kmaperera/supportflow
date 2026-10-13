require("dotenv").config({ path: require("node:path").resolve(__dirname, "../.env"), quiet: true });

try {
  require("./config/env").validateEnvironment();
} catch (error) {
  console.error(`SupportFlow environment configuration error: ${error.message}`);
  process.exit(1);
}

const app = require("./app");
const http = require("http");
const { initializeSocket } = require("./config/socket");
const { testDatabaseConnection } = require("./config/database");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await testDatabaseConnection();

    const server = http.createServer(app);
    initializeSocket(server);
    server.listen(PORT, () => {
      console.log(`SupportFlow server running on port ${PORT}`);
    });
  } catch {
    console.error("SupportFlow startup failed: check database and server configuration.");
    process.exit(1);
  }
}

startServer();
