const PDFDocument = require("pdfkit");
const { buildExportFilename } = require("./exportFilename");

function display(value) {
  if (value == null) return "";
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "bigint" ||
      (typeof value === "number" && Number.isFinite(value))) return String(value);
  throw new TypeError("PDF cells require scalar values or valid dates");
}

async function generatePdfReport({ title, subtitle = "", columns, rows, sections, orientation = "portrait", generatedAt = new Date() } = {}) {
  const tables = sections === undefined ? [{ columns, rows }] : sections;
  if (typeof title !== "string" || !title.trim() || typeof subtitle !== "string" ||
      !["portrait", "landscape"].includes(orientation) || !Array.isArray(tables) || !tables.length ||
      (sections !== undefined && (columns !== undefined || rows !== undefined)) || tables.some(table =>
        !table || (table.title !== undefined && (typeof table.title !== "string" || !table.title.trim())) ||
        !Array.isArray(table.rows) || !Array.isArray(table.columns) || !table.columns.length || table.columns.some(c =>
          !c || typeof c.header !== "string" || !c.header.trim() ||
          (c.value !== undefined ? typeof c.value !== "function" : typeof c.key !== "string" || !c.key) ||
          (c.width !== undefined && (!Number.isFinite(c.width) || c.width < 24))))) throw new TypeError("Invalid PDF report definition");
  if (!(generatedAt instanceof Date) || !Number.isFinite(generatedAt.getTime())) throw new TypeError("Invalid PDF generation date");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: orientation, margin: 40, autoFirstPage: false });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      let page = 0, y, widths, bodyBottom, headerHeight;
      const margin = 40, padding = 5;
      const font = bold => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      const height = (cells, bold) => {
        font(bold);
        return Math.max(12, ...cells.map((text, i) => doc.heightOfString(text, { width: widths[i] - padding * 2 }))) + padding * 2;
      };
      const draw = (cells, rowHeight, bold) => {
        font(bold);
        let x = margin;
        cells.forEach((text, i) => {
          doc.rect(x, y, widths[i], rowHeight).fillAndStroke(bold ? "#e8edf2" : "#ffffff", "#cbd5df");
          doc.fillColor("#17212b").text(text, x + padding, y + padding, { width: widths[i] - padding * 2, height: rowHeight - padding * 2 });
          x += widths[i];
        });
        y += rowHeight;
      };
      let headers, sectionTitle;
      const newPage = first => {
        doc.addPage(); page++;
        const available = doc.page.width - margin * 2;
        const fixed = columns.reduce((sum, c) => sum + (c.width ?? 0), 0);
        const flexible = columns.filter(c => c.width === undefined).length;
        if (fixed > available || (flexible && (available - fixed) / flexible < 24)) throw new TypeError("PDF columns exceed page width");
        widths = columns.map(c => c.width ?? (available - fixed) / flexible);
        bodyBottom = doc.page.height - 65;
        doc.font("Helvetica").fontSize(8).fillColor("#56616c")
          .text(`SupportFlow | Page ${page}`, margin, doc.page.height - 50, { width: available, lineBreak: false });
        y = margin;
        if (first) {
          for (const [text, size] of [[title, 18], [subtitle, 10], [`Generated: ${generatedAt.toISOString()}`, 9]]) {
            if (!text) continue;
            doc.font("Helvetica").fontSize(size);
            const h = doc.heightOfString(text, { width: available });
            if (y + h > bodyBottom - 50) throw new RangeError("PDF heading exceeds page body");
            doc.fillColor("#17212b").text(text, margin, y, { width: available });
            y += h + 10;
          }
        }
        if (sectionTitle) {
          doc.font("Helvetica-Bold").fontSize(13);
          const h = doc.heightOfString(sectionTitle, { width: available });
          if (y + h > bodyBottom - 50) throw new RangeError("PDF section heading exceeds page body");
          doc.fillColor("#17212b").text(sectionTitle, margin, y, { width: available });
          y += h + 12;
        }
        headerHeight = height(headers, true);
        if (headerHeight > bodyBottom - y - 24) throw new RangeError("PDF header exceeds page body");
        draw(headers, headerHeight, true);
      };
      for (const table of tables) {
        columns = table.columns;
        headers = columns.map(c => c.header);
        sectionTitle = table.title;
        // A fresh page gives each section an unambiguous heading and table.
        newPage(page === 0);
        for (const row of table.rows) {
        if (!row || typeof row !== "object") throw new TypeError("Invalid PDF row");
        const cells = columns.map(c => display(c.value ? c.value(row) : Object.hasOwn(row, c.key) ? row[c.key] : undefined));
        const rowHeight = height(cells, false);
        if (rowHeight > bodyBottom - margin - headerHeight) throw new RangeError("PDF row exceeds page body");
        if (y + rowHeight > bodyBottom) newPage(false);
        if (y + rowHeight > bodyBottom) throw new RangeError("PDF row exceeds page body");
        draw(cells, rowHeight, false);
      }
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
function buildPdfFilename(baseName, date) { return buildExportFilename(baseName, "pdf", date); }
function sendPdfDownload(res, { pdfBuffer, filename } = {}) {
  if (!Buffer.isBuffer(pdfBuffer) || typeof filename !== "string" || filename.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.pdf$/.test(filename)) throw new TypeError("Invalid PDF download");
  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(pdfBuffer);
}
module.exports = { generatePdfReport, buildPdfFilename, sendPdfDownload };
