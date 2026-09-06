const validate = require("../../middleware/validate");
const { changePasswordValidation, loginValidation } = require("./auth.validation");
const express = require("express");
const authenticate = require("../../middleware/authenticate");
const { refresh, logout, logoutAll, getCurrentUser, changePassword, login } = require("./auth.controller");

const router = express.Router();
router.post("/login", loginValidation, validate, login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/logout-all", logoutAll);
router.get("/me", authenticate, getCurrentUser);
router.patch("/change-password", authenticate, changePasswordValidation, validate, changePassword);

module.exports = router;





