const service = require("./dashboard.service");
const asyncHandler = require("../../utils/asyncHandler");

const getEmployeeSummary = asyncHandler(async (req, res) => {
  const summary = await service.getEmployeeDashboardSummary(req.user.id);
  res.status(200).json({ success: true, message: "Employee dashboard summary retrieved successfully", data: { summary } });
});

const getTechnicianSummary = asyncHandler(async (req, res) => {
  const summary = await service.getTechnicianDashboardSummary(req.user.id);
  res.status(200).json({ success: true, message: "Technician dashboard summary retrieved successfully", data: { summary } });
});

const getAdminSummary = asyncHandler(async (req, res) => {
  const summary = await service.getAdminDashboardSummary();
  res.status(200).json({ success: true, message: "Admin dashboard summary retrieved successfully", data: { summary } });
});

const getTicketSummaryCards = asyncHandler(async (req, res) => {
  const cards = await service.getTicketSummaryCards(req.user);
  res.status(200).json({ success: true, message: "Ticket summary cards retrieved successfully", data: { cards } });
});

module.exports = { getEmployeeSummary, getTechnicianSummary, getAdminSummary, getTicketSummaryCards };
