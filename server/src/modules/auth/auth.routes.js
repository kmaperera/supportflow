const validate = require("../../middleware/validate");
const { changePasswordValidation, loginValidation } = require("./auth.validation");
const express = require("express");
const authenticate = require("../../middleware/authenticate");
const { refresh, logout, logoutAll, getCurrentUser, changePassword, login } = require("./auth.controller");

const router = express.Router();
const { createLoginRateLimiter } = require("../../middleware/rateLimiter");
const { cookieActionValidation } = require('./auth.validation');
router.post("/login", createLoginRateLimiter(), loginValidation, validate, login);
router.post("/refresh", cookieActionValidation, validate, refresh);
router.post("/logout", cookieActionValidation, validate, logout);
router.post("/logout-all", cookieActionValidation, validate, logoutAll);
router.get("/me", authenticate, getCurrentUser);
router.patch("/change-password", authenticate, changePasswordValidation, validate, changePassword);

module.exports = router;





