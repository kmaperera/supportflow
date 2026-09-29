const asyncHandler = require('../../utils/asyncHandler');
const service = require('./audit.service');
exports.getLogs = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, message: 'Audit logs retrieved successfully', data: await service.getLogs(req.query) });
});
