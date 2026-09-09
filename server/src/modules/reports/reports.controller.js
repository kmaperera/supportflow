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
module.exports = { getTicketReport, getDateRangeReport };
