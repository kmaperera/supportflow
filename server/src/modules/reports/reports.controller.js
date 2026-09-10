const { sendPdfDownload } = require("../../utils/pdf");
const csvService = require("./reports.csv");
const { sendCsvDownload } = require("../../utils/csv");
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
const getStatusReport = asyncHandler(async (req, res) => {
  const data = await service.getStatusReport(req.query);
  res.status(200).json({ success: true, message: "Status report retrieved successfully", data });
});
const exportTicketCsv = asyncHandler(async (req, res) => {
  const payload = await service.getTicketCsvExport(req.query);
  sendCsvDownload(res, payload);
});
const exportDateRangeCsv = asyncHandler(async (req, res) => {
  const payload = await csvService.getDateRangeCsvExport(req.query);
  sendCsvDownload(res, payload);
});
const exportTechnicianPerformanceCsv = asyncHandler(async (req, res) => {
  const payload = await csvService.getTechnicianPerformanceCsvExport(req.query);
  sendCsvDownload(res, payload);
});
const exportSlaCsv = asyncHandler(async (req, res) => {
  const payload = await csvService.getSlaCsvExport(req.query);
  sendCsvDownload(res, payload);
});
const exportCategoryCsv = asyncHandler(async (req, res) => {
  const payload = await csvService.getCategoryCsvExport(req.query);
  sendCsvDownload(res, payload);
});
const exportPriorityCsv = asyncHandler(async (req, res) => {
  const payload = await csvService.getPriorityCsvExport(req.query);
  sendCsvDownload(res, payload);
});
const exportStatusCsv = asyncHandler(async (req, res) => {
  const payload = await csvService.getStatusCsvExport(req.query);
  sendCsvDownload(res, payload);
});
const exportTicketPdf = asyncHandler(async (req, res) => {
  const payload = await service.getTicketPdfExport(req.query);
  sendPdfDownload(res, payload);
});
module.exports = { exportTicketPdf, exportDateRangeCsv, exportTechnicianPerformanceCsv, exportSlaCsv, exportCategoryCsv, exportPriorityCsv, exportStatusCsv, exportTicketCsv, getTicketReport, getDateRangeReport, getTechnicianPerformanceReport, getSlaReport, getCategoryReport, getPriorityReport, getStatusReport };
