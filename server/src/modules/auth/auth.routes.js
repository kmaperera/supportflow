const express = require("express");
const { refresh } = require("./auth.controller");

const router = express.Router();
router.post("/refresh", refresh);

module.exports = router;
