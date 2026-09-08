const express = require("express");
const authenticate = require("../../middleware/authenticate");
const validate = require("../../middleware/validate");
const { getNotificationsValidation, markNotificationAsReadValidation } = require("./notification.validation");
const controller = require("./notification.controller");

const router = express.Router();
router.get("/", authenticate, getNotificationsValidation, validate, controller.getUserNotifications);
router.patch("/:notificationId/read", authenticate, markNotificationAsReadValidation, validate, controller.markNotificationAsRead);

module.exports = router;
