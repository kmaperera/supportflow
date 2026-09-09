const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const requestLogger = require("./utils/logger");
const cookieParser = require("cookie-parser");
const ApiError = require("./utils/ApiError");
const errorHandler = require("./middleware/errorHandler");
const ticketRoutes = require("./modules/tickets/ticket.routes");
const userRoutes = require("./modules/users/user.routes");
const authRoutes = require("./modules/auth/auth.routes");
const healthRoutes = require("./modules/health/health.routes");
const notificationRoutes = require("./modules/notifications/notification.routes");
const slaPolicyRoutes = require("./modules/sla/slaPolicy.routes");
const knowledgeBaseRoutes = require("./modules/knowledgeBase/knowledgeBase.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

app.use(requestLogger);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SupportFlow API is running",
  });
});

app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/tickets", ticketRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/sla", slaPolicyRoutes);
app.use("/api/v1/knowledge-base", knowledgeBaseRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);

app.use((req, res, next) => {
  next(new ApiError(404, `Route ${req.path} not found`));
});

app.use(errorHandler);

module.exports = app;




