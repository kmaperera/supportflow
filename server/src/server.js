require("dotenv").config();

const app = require("./app");
const { testDatabaseConnection } = require("./config/database");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await testDatabaseConnection();

    app.listen(PORT, () => {
      console.log(`SupportFlow server running on port ${PORT}`);
    });
  } catch {
    console.error("SupportFlow startup failed: unable to connect to the database.");
    process.exit(1);
  }
}

startServer();
