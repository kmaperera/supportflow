const service = require("./dashboard.service");
const asyncHandler = require("../../utils/asyncHandler");

const getEmployeeSummary = asyncHandler(async (req, res) => {
  const summary = await service.getEmployeeDashboardSummary(req.user.id);
  res.status(200).json({ success: true, message: "Employee dashboard summary retrieved successfully", data: { summary } });
});

module.exports = { getEmployeeSummary };
