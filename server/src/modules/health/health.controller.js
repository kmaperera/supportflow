const pool = require("../../config/database");
const asyncHandler = require("../../utils/asyncHandler");

const getHealthStatus = asyncHandler(async (req, res) => {
  await pool.query("SELECT 1");

  res.status(200).json({
    success: true,
    message: "SupportFlow API is healthy",
    data: {
      server: "UP",
      database: "UP",
    },
  });
});

module.exports = { getHealthStatus };
