const service = require("./reports.service");
const { generateCsv, buildCsvFilename } = require("../../utils/csv");

// Server-owned schemas; all metrics and ordering come from existing report services.
const DATERANGE_COLUMNS = [
  {
    "header": "Date",
    "key": "date"
  },
  {
    "header": "Ticket Count",
    "key": "ticketCount"
  }
];
async function getDateRangeCsvExport(params, db) {
  const { report } = await service.getDateRangeReport(params, db);
  return { csv: generateCsv({ columns: DATERANGE_COLUMNS, rows: report.dailyBreakdown }),
    filename: buildCsvFilename("supportflow-date-range-report") };
}

const TECHNICIANPERFORMANCE_COLUMNS = [
  {
    "header": "Technician",
    "key": "technicianName"
  },
  {
    "header": "Email",
    "key": "email"
  },
  {
    "header": "Active",
    "key": "isActive"
  },
  {
    "header": "Assigned Tickets",
    "key": "assignedTickets"
  },
  {
    "header": "Resolved Tickets",
    "key": "resolvedTickets"
  },
  {
    "header": "Average First Response Minutes",
    "key": "averageFirstResponseMinutes"
  },
  {
    "header": "Average Resolution Minutes",
    "key": "averageResolutionMinutes"
  },
  {
    "header": "Response SLA Compliance %",
    "key": "responseSlaCompliancePercentage"
  },
  {
    "header": "Resolution SLA Compliance %",
    "key": "resolutionSlaCompliancePercentage"
  }
];
async function getTechnicianPerformanceCsvExport(params, db) {
  const { report } = await service.getTechnicianPerformanceReport(params, db);
  return { csv: generateCsv({ columns: TECHNICIANPERFORMANCE_COLUMNS, rows: report.technicians }),
    filename: buildCsvFilename("supportflow-technician-performance") };
}

const SLA_COLUMNS = [
  {
    "header": "SLA Type",
    "key": "slaType"
  },
  {
    "header": "Tracked Tickets",
    "key": "trackedTickets"
  },
  {
    "header": "Met Tickets",
    "key": "metTickets"
  },
  {
    "header": "Missed Tickets",
    "key": "missedTickets"
  },
  {
    "header": "Pending Tickets",
    "key": "pendingTickets"
  },
  {
    "header": "Completed Tickets",
    "key": "completedTickets"
  },
  {
    "header": "Compliance %",
    "key": "compliancePercentage"
  }
];
async function getSlaCsvExport(params, db) {
  const { report } = await service.getSlaReport(params, db);
  return { csv: generateCsv({ columns: SLA_COLUMNS, rows: [{ slaType: "Response", ...report.responseSla }, { slaType: "Resolution", ...report.resolutionSla }] }),
    filename: buildCsvFilename("supportflow-sla-report") };
}

const CATEGORY_COLUMNS = [
  {
    "header": "Category",
    "key": "categoryName"
  },
  {
    "header": "Active",
    "key": "isActive"
  },
  {
    "header": "Total Tickets",
    "key": "totalTickets"
  },
  {
    "header": "Active Tickets",
    "key": "activeTickets"
  },
  {
    "header": "Resolved Tickets",
    "key": "resolvedTickets"
  },
  {
    "header": "Closed Tickets",
    "key": "closedTickets"
  },
  {
    "header": "Percentage of Tickets",
    "key": "percentageOfTickets"
  }
];
async function getCategoryCsvExport(params, db) {
  const { report } = await service.getCategoryReport(params, db);
  return { csv: generateCsv({ columns: CATEGORY_COLUMNS, rows: report.categories }),
    filename: buildCsvFilename("supportflow-category-report") };
}

const PRIORITY_COLUMNS = [
  {
    "header": "Priority",
    "key": "priorityName"
  },
  {
    "header": "Total Tickets",
    "key": "totalTickets"
  },
  {
    "header": "Active Tickets",
    "key": "activeTickets"
  },
  {
    "header": "Resolved Tickets",
    "key": "resolvedTickets"
  },
  {
    "header": "Closed Tickets",
    "key": "closedTickets"
  },
  {
    "header": "Percentage of Tickets",
    "key": "percentageOfTickets"
  }
];
async function getPriorityCsvExport(params, db) {
  const { report } = await service.getPriorityReport(params, db);
  return { csv: generateCsv({ columns: PRIORITY_COLUMNS, rows: report.priorities }),
    filename: buildCsvFilename("supportflow-priority-report") };
}

const STATUS_COLUMNS = [
  {
    "header": "Status",
    "key": "status"
  },
  {
    "header": "Total Tickets",
    "key": "totalTickets"
  },
  {
    "header": "Percentage of Tickets",
    "key": "percentageOfTickets"
  }
];
async function getStatusCsvExport(params, db) {
  const { report } = await service.getStatusReport(params, db);
  return { csv: generateCsv({ columns: STATUS_COLUMNS, rows: report.statuses }),
    filename: buildCsvFilename("supportflow-status-report") };
}

module.exports = { getDateRangeCsvExport, getTechnicianPerformanceCsvExport, getSlaCsvExport, getCategoryCsvExport, getPriorityCsvExport, getStatusCsvExport };
