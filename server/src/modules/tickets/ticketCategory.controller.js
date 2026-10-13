const adminAudit = require('../audit/audit.admin');
const service = require('./ticketCategory.service');
const asyncHandler = require('../../utils/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const categories = await service.getCategories();
  res.json({ success: true, message: 'Ticket categories retrieved successfully', data: { categories } });
});
exports.get = asyncHandler(async (req, res) => {
  const category = await service.getCategoryById(req.params.categoryId);
  res.json({ success: true, message: 'Ticket category retrieved successfully', data: { category } });
});
exports.create = asyncHandler(async (req, res) => {
  const category = await service.createCategory(req.body, req.user.id, undefined, adminAudit.contextFromRequest(req));
  res.status(201).json({ success: true, message: 'Ticket category created successfully', data: { category } });
});
exports.update = asyncHandler(async (req, res) => {
  const category = await service.updateCategory(req.params.categoryId, req.body, undefined, adminAudit.contextFromRequest(req));
  res.json({ success: true, message: 'Ticket category updated successfully', data: { category } });
});
exports.status = asyncHandler(async (req, res) => {
  const category = await service.setCategoryActiveStatus(req.params.categoryId, req.body.isActive, undefined, adminAudit.contextFromRequest(req));
  res.json({ success: true, message: 'Ticket category status updated successfully', data: { category } });
});
