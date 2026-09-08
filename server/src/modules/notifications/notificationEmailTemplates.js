const { NOTIFICATION_TYPES } = require("../../constants/notificationTypes");
const ApiError = require("../../utils/ApiError");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function templateString(value, name, required = false) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(422, `${name} must be a non-empty string`);
  }
  // Template context is single-line data, including values used in subjects.
  return value.trim().replace(/[\r\n]+/g, " ");
}

function buildNotificationEmail({ type, recipientName, ticketNumber, ticketTitle,
  statusLabel, reassignmentDirection, commentContext } = {}) {
  ticketNumber = templateString(ticketNumber, "Ticket number", true);
  recipientName = templateString(recipientName, "Recipient name") || "there";
  ticketTitle = templateString(ticketTitle, "Ticket title");
  let subject;
  let message;
  let action = "Please sign in to SupportFlow to review the ticket.";

  switch (type) {
    case NOTIFICATION_TYPES.TICKET_CREATED:
      subject = `Ticket ${ticketNumber} created`;
      message = `Your support ticket ${ticketNumber} has been created successfully.`;
      action = "You can sign in to SupportFlow to view its progress.";
      break;
    case NOTIFICATION_TYPES.TICKET_ASSIGNED:
      subject = `Ticket ${ticketNumber} assigned to you`;
      message = `Ticket ${ticketNumber} has been assigned to you.`;
      break;
    case NOTIFICATION_TYPES.TICKET_REASSIGNED:
      if (!["TO_YOU", "AWAY_FROM_YOU"].includes(reassignmentDirection)) {
        throw new ApiError(422, "Reassignment direction must be TO_YOU or AWAY_FROM_YOU");
      }
      subject = `Ticket ${ticketNumber} reassigned${reassignmentDirection === "TO_YOU" ? " to you" : ""}`;
      message = reassignmentDirection === "TO_YOU"
        ? `Ticket ${ticketNumber} has been reassigned to you.`
        : `Ticket ${ticketNumber} has been reassigned to another technician and is no longer assigned to you.`;
      if (reassignmentDirection === "AWAY_FROM_YOU") action = "Sign in to SupportFlow to view your current assignments.";
      break;
    case NOTIFICATION_TYPES.TICKET_UNASSIGNED:
      subject = `Ticket ${ticketNumber} unassigned`;
      message = `Ticket ${ticketNumber} is no longer assigned to you.`;
      action = "Sign in to SupportFlow to view your current assignments.";
      break;
    case NOTIFICATION_TYPES.STATUS_CHANGED:
      statusLabel = templateString(statusLabel, "Status label", true);
      subject = `Ticket ${ticketNumber} status updated`;
      message = `The status of ticket ${ticketNumber} changed to ${statusLabel}.`;
      break;
    case NOTIFICATION_TYPES.PUBLIC_COMMENT:
      if (!["EMPLOYEE_REPLY", "SUPPORT_REPLY"].includes(commentContext)) {
        throw new ApiError(422, "Comment context must be EMPLOYEE_REPLY or SUPPORT_REPLY");
      }
      subject = `New ${commentContext === "SUPPORT_REPLY" ? "support " : ""}reply on ${ticketNumber}`;
      message = commentContext === "SUPPORT_REPLY" ? `Support replied to your ticket ${ticketNumber}.`
        : `A new reply was added to ticket ${ticketNumber}.`;
      break;
    case NOTIFICATION_TYPES.INTERNAL_NOTE:
      // Support-only template; future delivery logic must enforce recipient authorization.
      subject = `New internal note on ${ticketNumber}`;
      message = `A new internal note was added to ticket ${ticketNumber}.`;
      break;
    case NOTIFICATION_TYPES.TICKET_RESOLVED:
      subject = `Ticket ${ticketNumber} resolved`;
      message = `Your ticket ${ticketNumber} has been resolved.`;
      break;
    case NOTIFICATION_TYPES.TICKET_REOPENED:
      subject = `Ticket ${ticketNumber} reopened`;
      message = `Ticket ${ticketNumber} has been reopened.`;
      break;
    case NOTIFICATION_TYPES.TICKET_CLOSED:
      subject = `Ticket ${ticketNumber} closed`;
      message = `Ticket ${ticketNumber} has been closed.`;
      break;
    default:
      throw new ApiError(422, "Unsupported notification email type");
  }

  const greeting = `Hello ${recipientName},`;
  const text = [greeting, message, ...(ticketTitle ? [`Ticket: ${ticketTitle}`] : []), action, "SupportFlow"].join("\n\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#222;line-height:1.6;max-width:600px;padding:24px;">
  <h1 style="font-size:24px;margin:0 0 20px;">SupportFlow</h1>
  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(message)}</p>
  ${ticketTitle ? `<p><strong>Ticket:</strong> ${escapeHtml(ticketTitle)}</p>` : ""}
  <p>${escapeHtml(action)}</p>
  <p style="font-size:12px;color:#666;">SupportFlow</p>
</div>`;
  return { subject: `[SupportFlow] ${subject}`, text, html };
}

module.exports = { buildNotificationEmail, escapeHtml };
