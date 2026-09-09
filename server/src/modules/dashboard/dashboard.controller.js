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

const getAverageFirstResponseTime = asyncHandler(async (req, res) => {
  const summary = await service.getAverageFirstResponseTime(req.user);
  res.status(200).json({ success: true, message: "Average first-response time retrieved successfully", data: { summary } });
});

const getAverageResolutionTime = asyncHandler(async (req, res) => {
  const summary = await service.getAverageResolutionTime(req.user);
  res.status(200).json({ success: true, message: "Average resolution time retrieved successfully", data: { summary } });
});

const getSlaComplianceMetrics = asyncHandler(async (req, res) => {
  const summary = await service.getSlaComplianceMetrics(req.user);
  res.status(200).json({ success: true, message: "SLA compliance metrics retrieved successfully", data: { summary } });
});

const getTicketTrend = asyncHandler(async (req, res) => {
  const data = await service.getTicketTrend(req.user, req.query.period);
  res.status(200).json({ success: true, message: "Ticket trend retrieved successfully", data });
});

const getRecentTickets = asyncHandler(async (req, res) => {
  const tickets = await service.getRecentTickets(req.user, req.query.limit);
  res.status(200).json({ success: true, message: "Recent tickets retrieved successfully", data: { tickets } });
});

const getRecentTicketActivity = asyncHandler(async (req, res) => {
  const activities = await service.getRecentTicketActivity(req.user, req.query.limit);
  res.status(200).json({ success: true, message: "Recent ticket activity retrieved successfully", data: { activities } });
});

const getSatisfactionSummary = asyncHandler(async (req, res) => {
  const summary = await service.getSatisfactionSummary();
  res.status(200).json({ success: true, message: "Satisfaction summary retrieved successfully", data: { summary } });
});

module.exports = { getEmployeeSummary, getTechnicianSummary, getAdminSummary, getTicketSummaryCards, getTicketStatusDistribution, getTicketCategoryDistribution, getTicketPriorityDistribution, getTechnicianWorkload, getAverageFirstResponseTime, getAverageResolutionTime, getSlaComplianceMetrics, getTicketTrend, getRecentTickets, getRecentTicketActivity, getSatisfactionSummary };
