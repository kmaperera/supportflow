const service = require("./reports.service");
const asyncHandler = require("../../utils/asyncHandler");
const getTicketReport = asyncHandler(async (req, res) => {
  const data = await service.getTicketReportQuery(req.query);
  res.status(200).json({ success: true, message: "Ticket report retrieved successfully", data });
});
const getDateRangeReport = asyncHandler(async (req, res) => {
  const data = await service.getDateRangeReport({ startDate: req.query.startDate, endDate: req.query.endDate });
  res.status(200).json({ success: true, message: "Date-range report retrieved successfully", data });
});
const getTechnicianPerformanceReport = asyncHandler(async (req, res) => {
  const data = await service.getTechnicianPerformanceReport({ startDate: req.query.startDate, endDate: req.query.endDate });
  res.status(200).json({ success: true, message: "Technician performance report retrieved successfully", data });
});
const getSlaReport = asyncHandler(async (req, res) => {
  const data = await service.getSlaReport(req.query);
  res.status(200).json({ success: true, message: "SLA report retrieved successfully", data });
});
const getCategoryReport = asyncHandler(async (req, res) => {
  const data = await service.getCategoryReport(req.query);
  res.status(200).json({ success: true, message: "Category report retrieved successfully", data });
});
const getPriorityReport = asyncHandler(async (req, res) => {
  const data = await service.getPriorityReport(req.query);
  res.status(200).json({ success: true, message: "Priority report retrieved successfully", data });
});
module.exports = { getTicketReport, getDateRangeReport, getTechnicianPerformanceReport, getSlaReport, getCategoryReport, getPriorityReport };
