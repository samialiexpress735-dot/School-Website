import { downloadBlob } from "./importer.js";

const HEAD = { fontWeight: "bold", backgroundColor: "#DCE6F2", wrap: true };

// columns: [{ label, width?, get: (row) => string | number | null }]. Text is written as TEXT cells so Excel keeps
// leading zeros (phone numbers) and never turns a value such as 02/09/2002 into a date.
export async function buildExportXlsx({ sheetName, columns, rows }) {
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  const head = columns.map((c) => ({ value: c.label, ...HEAD }));
  const data = [head, ...rows.map((r) => columns.map((c) => {
    const v = c.get(r);
    if (v == null || v === "") return null;
    return typeof v === "number" ? v : { value: String(v), type: String };
  }))];
  return writeXlsxFile([{ data, sheet: sheetName, columns: columns.map((c) => ({ width: c.width || 16 })), stickyRowsCount: 1 }]).toBlob();
}

export async function downloadExport(filename, spec) {
  downloadBlob(`${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`, await buildExportXlsx(spec));
}
