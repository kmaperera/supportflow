const express = require("express");
const authenticate = require("../../middleware/authenticate");
const validate = require("../../middleware/validate");
const { getNotificationsValidation } = require("./notification.validation");
const controller = require("./notification.controller");

const router = express.Router();
router.get("/", authenticate, getNotificationsValidation, validate, controller.getUserNotifications);

module.exports = router;
