const service = require("./notification.service");
const asyncHandler = require("../../utils/asyncHandler");

const getUserNotifications = asyncHandler(async (req, res) => {
  const { page, limit, unreadOnly } = req.query;
  const data = await service.getUserNotifications(req.user.id, { page, limit, unreadOnly });
  res.status(200).json({ success: true, message: "Notifications retrieved successfully", data });
});

const markNotificationAsRead = asyncHandler(async (req, res) => {
  const notification = await service.markNotificationAsRead(req.params.notificationId, req.user.id);
  res.status(200).json({
    success: true,
    message: "Notification marked as read successfully",
    data: { notification },
  });
});

module.exports = { getUserNotifications, markNotificationAsRead };
