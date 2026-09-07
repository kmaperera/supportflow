const { TICKET_SORT_FIELDS, TICKET_SORT_DIRECTIONS, MAX_LIMIT } = require("../../constants/ticketQuery");
const { TICKET_STATUSES } = require("../../constants/ticketStatuses");
﻿const { body, query, param } = require("express-validator");

const positiveId = (value) => {
  if (!(["string", "number"].includes(typeof value)) ||
      (typeof value === "number" && !Number.isSafeInteger(value))) return false;
  const id = String(value);
  return /^[1-9]\d*$/.test(id) && id.length <= 20 && BigInt(id) <= 18446744073709551615n;
};

const createTicketValidation = [
  body().custom((value) => {
    const allowed = ["categoryId", "priorityId", "title", "description"];
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new Error("Only categoryId, priorityId, title, and description are allowed");
    }
    return true;
  }),
  body("categoryId").custom(positiveId).withMessage("Category ID must be a positive integer"),
  body("priorityId").custom(positiveId).withMessage("Priority ID must be a positive integer"),
  body("title").isString().withMessage("Title is required").bail()
    .trim().isLength({ min: 5, max: 200 }).withMessage("Title must be 5 to 200 characters"),
  body("description").isString().withMessage("Description is required").bail()
    .trim().isLength({ min: 10, max: 5000 }).withMessage("Description must be 10 to 5000 characters"),
];

function ticketDateValidation() {
  return [
    ...["fromDate", "toDate"].map((field) => query(field).optional().isString().bail()
      .matches(/^\d{4}-\d{2}-\d{2}$/).bail().isISO8601({ strict: true })
      .withMessage("Date must be a valid YYYY-MM-DD date")),
    query().custom((value) => {
      if (typeof value.fromDate === "string" && typeof value.toDate === "string" &&
          value.fromDate > value.toDate) throw new Error("fromDate cannot be later than toDate");
      return true;
    }),
  ];
}

const getMyTicketsValidation = [
  query().custom((value) => {
    const allowed = ["page", "limit", "search", "status", "categoryId", "priorityId", "fromDate", "toDate", "sortBy", "order"];
    if (Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new Error("Unsupported ticket query parameter");
    }
    return true;
  }),
  query("page").optional().custom((value) => positiveId(value) && Number.isSafeInteger(Number(value)))
    .withMessage("Page must be a positive integer"),
  query("limit").optional().custom((value) => positiveId(value) && Number(value) <= MAX_LIMIT)
    .withMessage("Limit must be between 1 and 100"),
  query("search").optional().isString().bail().trim().isLength({ max: 200 }),
  query("categoryId").optional().custom(positiveId).withMessage("Invalid category ID"),
  query("priorityId").optional().custom(positiveId).withMessage("Invalid priority ID"),
  query("status").optional().isString().bail()
    .isIn(Object.values(TICKET_STATUSES)),
  ...ticketDateValidation(),
  query("sortBy").optional().isString().bail()
    .isIn(TICKET_SORT_FIELDS),
  query("order").optional().isString().bail().toLowerCase().isIn(TICKET_SORT_DIRECTIONS),
];

const ticketIdValidation = [
  param("id").custom(positiveId).withMessage("Ticket ID must be a positive integer"),
];

const updateEmployeeTicketValidation = [
  ...ticketIdValidation,
  body().custom((value) => {
    const allowed = ["categoryId", "priorityId", "title", "description"];
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        !Object.keys(value).length || Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new Error("Supply at least one of categoryId, priorityId, title, or description; other fields are not allowed");
    }
    return true;
  }),
  body("categoryId").optional().custom(positiveId).withMessage("Invalid category ID"),
  body("priorityId").optional().custom(positiveId).withMessage("Invalid priority ID"),
  body("title").optional().isString().bail().trim().isLength({ min: 5, max: 200 })
    .withMessage("Title must be 5 to 200 characters"),
  body("description").optional().isString().bail().trim().isLength({ min: 10, max: 5000 })
    .withMessage("Description must be 10 to 5000 characters"),
];

const ticketQueueValidation = [
  query().custom((value) => {
    const allowed = ["page", "limit", "search", "status", "categoryId", "priorityId", "assignedTo", "assignment", "fromDate", "toDate", "sortBy", "order"];
    if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Unsupported queue query parameter");
    return true;
  }),
  query("page").optional().custom((value) => positiveId(value) && Number.isSafeInteger(Number(value)))
    .withMessage("Page must be a positive integer"),
  query("limit").optional().custom((value) => positiveId(value) && Number(value) <= MAX_LIMIT)
    .withMessage("Limit must be between 1 and 100"),
  query("search").optional().isString().bail().trim().isLength({ max: 200 }),
  query("categoryId").optional().custom(positiveId),
  query("priorityId").optional().custom(positiveId),
  query("assignedTo").optional().custom(positiveId),
  query("status").optional().isString().bail()
    .isIn(Object.values(TICKET_STATUSES)),
  query("assignment").optional().isString().bail().isIn(["unassigned", "assigned", "mine"]),
  ...ticketDateValidation(),
  query("sortBy").optional().isString().bail()
    .isIn(TICKET_SORT_FIELDS),
  query("order").optional().isString().bail().toLowerCase().isIn(TICKET_SORT_DIRECTIONS),
];

const adminAssignTicketValidation = [
  ...ticketIdValidation,
  body("technicianId").custom(positiveId).withMessage("Technician ID must be a positive integer"),
];

const updateTicketStatusValidation = [
  ...ticketIdValidation,
  body().custom((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((key) => key !== "status")) {
      throw new Error("Only status is allowed");
    }
    return true;
  }),
  body("status").isString().withMessage("Status is required and must be a string").bail()
    .isIn([TICKET_STATUSES.IN_PROGRESS, TICKET_STATUSES.WAITING_FOR_USER])
    .withMessage("Status must be IN_PROGRESS or WAITING_FOR_USER"),
];

const updateTicketPriorityValidation = [
  ...ticketIdValidation,
  body().custom((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((key) => key !== "priorityId")) {
      throw new Error("Only priorityId is allowed");
    }
    return true;
  }),
  body("priorityId").custom(positiveId).withMessage("Priority ID must be a positive integer"),
];

const resolveTicketValidation = [
  ...ticketIdValidation,
  body().custom((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((key) => key !== "resolutionSummary")) {
      throw new Error("Only resolutionSummary is allowed");
    }
    return true;
  }),
  body("resolutionSummary").isString()
    .withMessage("Resolution summary is required and must be a string").bail()
    .trim().isLength({ min: 10, max: 5000 })
    .withMessage("Resolution summary must be 10 to 5000 characters"),
];

const closeTicketValidation = [
  ...ticketIdValidation,
  body().custom((value) => {
    if (value !== undefined &&
        (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length)) {
      throw new Error("Request body must be empty");
    }
    return true;
  }),
];

const reopenTicketValidation = [
  ...ticketIdValidation,
  body().custom((value) => {
    if (value !== undefined &&
        (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length)) {
      throw new Error("Request body must be empty");
    }
    return true;
  }),
];

module.exports = { reopenTicketValidation, closeTicketValidation, resolveTicketValidation, updateTicketPriorityValidation, updateTicketStatusValidation, adminAssignTicketValidation, ticketQueueValidation, createTicketValidation, getMyTicketsValidation, ticketIdValidation, updateEmployeeTicketValidation };





