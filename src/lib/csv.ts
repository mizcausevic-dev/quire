import { AppError } from "./errors";

export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\r") continue;
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (quoted) throw new AppError("The CSV has an unterminated quoted field.", "csv");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  while (rows.length > 0 && rows[rows.length - 1].every((value) => value === "")) rows.pop();
  return rows;
}

export function neutralizeSpreadsheetFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

export function serializeCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const safe = neutralizeSpreadsheetFormula(value ?? "");
          if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
          return safe;
        })
        .join(","),
    )
    .join("\r\n");
}

export function previewCsv(input: string): { headers: string[]; sample: string[][]; rowCount: number } {
  const rows = parseCsv(input);
  if (rows.length === 0) throw new AppError("The CSV is empty.", "csv");
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new AppError("Every CSV column needs a header.", "csv");
  const data = rows.slice(1);
  return { headers, sample: data.slice(0, 5), rowCount: data.length };
}
