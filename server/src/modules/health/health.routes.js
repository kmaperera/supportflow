const express = require("express");
const { getHealthStatus } = require("./health.controller");

const router = express.Router();

router.get("/", getHealthStatus);

module.exports = router;
