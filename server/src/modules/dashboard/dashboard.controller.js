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

const getTicketStatusDistribution = asyncHandler(async (req, res) => {
  const distribution = await service.getTicketStatusDistribution(req.user);
  res.status(200).json({ success: true, message: "Ticket status distribution retrieved successfully", data: { distribution } });
});

const getTicketCategoryDistribution = asyncHandler(async (req, res) => {
  const distribution = await service.getTicketCategoryDistribution(req.user);
  res.status(200).json({ success: true, message: "Ticket category distribution retrieved successfully", data: { distribution } });
});

const getTicketPriorityDistribution = asyncHandler(async (req, res) => {
  const distribution = await service.getTicketPriorityDistribution(req.user);
  res.status(200).json({ success: true, message: "Ticket priority distribution retrieved successfully", data: { distribution } });
});

const getTechnicianWorkload = asyncHandler(async (req, res) => {
  const technicians = await service.getTechnicianWorkloadAnalytics();
  res.status(200).json({ success: true, message: "Technician workload retrieved successfully", data: { technicians } });
});

module.exports = { getEmployeeSummary, getTechnicianSummary, getAdminSummary, getTicketSummaryCards, getTicketStatusDistribution, getTicketCategoryDistribution, getTicketPriorityDistribution, getTechnicianWorkload };
