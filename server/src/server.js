require("dotenv").config({ path: require("node:path").resolve(__dirname, "../.env"), quiet: true });

try {
  require("./config/env").validateEnvironment();
} catch (error) {
  console.error(`SupportFlow environment configuration error: ${error.message}`);
  process.exit(1);
}

const server = require("./httpServer");
const { testDatabaseConnection } = require("./config/database");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await testDatabaseConnection();

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`SupportFlow server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("SupportFlow startup failed: check database and server configuration.");
    require('./utils/startupError').logDevelopmentStartupError(error);
    process.exit(1);
  }
}

startServer();
