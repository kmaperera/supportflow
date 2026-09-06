const express = require("express");
const authenticate = require("../../middleware/authenticate");
const { refresh, logout, logoutAll, getCurrentUser } = require("./auth.controller");

const router = express.Router();
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/logout-all", logoutAll);
router.get("/me", authenticate, getCurrentUser);

module.exports = router;



