import ExcelJS from 'exceljs';

interface ParsedReport {
  title: string;
  meta: string; // "Model: X · Documents analyzed: N"
  summary: string;
  findings: string[];
  risks: Array<{ risk: string; severity: string; source: string; recommendation: string }>;
  followUps: string[];
  citations: string[];
}

function parseReport(markdown: string): ParsedReport {
  const lines = markdown.split('\n');

  let title = 'Risk Report';
  let meta = '';
  const sections: Record<string, string[]> = {};
  let currentSection = '';

  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.replace(/^# /, '').trim();
      continue;
    }
    if (line.startsWith('**Model**:')) {
      meta = line.replace(/\*\*/g, '').trim();
      continue;
    }
    if (line.startsWith('## ')) {
      currentSection = line.replace(/^## /, '').trim().toLowerCase();
      sections[currentSection] = [];
      continue;
    }
    if (currentSection) {
      sections[currentSection] = sections[currentSection] ?? [];
      sections[currentSection].push(line);
    }
  }

  const getText = (key: string) =>
    (sections[key] ?? []).join('\n').trim();

  const getBullets = (key: string) =>
    (sections[key] ?? [])
      .filter((l) => l.match(/^[-*\d]/))
      .map((l) => l.replace(/^[-*\d.]\s*/, '').trim())
      .filter(Boolean);

  // Parse the markdown risks table
  const riskLines = (sections['risks'] ?? []).filter((l) =>
    l.startsWith('|') && !l.match(/^\|[-\s|]+$/)
  );
  const riskHeader = riskLines[0];
  const riskRows = riskLines.slice(1);
  const parseRow = (line: string) =>
    line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);

  const risks = riskHeader
    ? riskRows.map((row) => {
        const [risk = '', severity = '', source = '', recommendation = ''] = parseRow(row);
        return { risk, severity, source, recommendation };
      })
    : [];

  return {
    title,
    meta,
    summary: getText('summary'),
    findings: getBullets('key findings'),
    risks,
    followUps: getBullets('recommended follow-ups'),
    citations: getBullets('citations'),
  };
}

// ── Style helpers ──────────────────────────────────────────────────────────

const NAVY = '1E3A5F';
const BRASS = 'C7A46C';
const LIGHT_GREY = 'F2F4F7';
const MED_GREY = 'D0D5DD';

function styleHeader(row: ExcelJS.Row, bgColor = NAVY, fontColor = 'FFFFFF') {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bgColor}` } };
    cell.font = { bold: true, color: { argb: `FF${fontColor}` }, size: 11 };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 20;
}

function styleSectionLabel(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${LIGHT_GREY}` } };
    cell.font = { bold: true, color: { argb: `FF${NAVY}` }, size: 10 };
    cell.border = {
      bottom: { style: 'thin', color: { argb: `FF${MED_GREY}` } },
    };
  });
  row.height = 18;
}

function styleData(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.font = { size: 10 };
    cell.border = {
      bottom: { style: 'hair', color: { argb: `FF${MED_GREY}` } },
    };
  });
}

function riskColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'high': return 'FFF2CCCC'; // light red
    case 'medium': return 'FFFFF2CC'; // light yellow
    case 'low': return 'FFE6F4EA'; // light green
    default: return 'FFFFFFFF';
  }
}

export async function generateReportExcel(
  markdown: string,
  taskTitle: string,
  metadata: {
    confidenceScore?: number | null;
    confidenceReason?: string | null;
    completedAt?: Date | string | null;
  }
): Promise<Buffer> {
  const parsed = parseReport(markdown);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DealDiligence.ai';
  workbook.created = new Date();

  // ── Sheet 1: Overview ────────────────────────────────────────────────────
  const overview = workbook.addWorksheet('Overview', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
  });
  overview.columns = [
    { key: 'label', width: 22 },
    { key: 'value', width: 60 },
  ];

  // Title row
  const titleRow = overview.addRow([parsed.title, '']);
  overview.mergeCells(`A${titleRow.number}:B${titleRow.number}`);
  titleRow.getCell(1).value = parsed.title;
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FFE8ECF0` } };
  titleRow.getCell(1).alignment = { vertical: 'middle' };
  titleRow.height = 26;

  overview.addRow([]);

  const metaItems = [
    ['Task', taskTitle],
    ['Generated', metadata.completedAt ? new Date(metadata.completedAt).toLocaleString('en-US') : '—'],
    ['Model info', parsed.meta || '—'],
    ['Confidence', metadata.confidenceScore != null ? `${metadata.confidenceScore}/100` : '—'],
    ['Confidence rationale', metadata.confidenceReason || '—'],
  ];
  for (const [label, value] of metaItems) {
    const row = overview.addRow([label, value]);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: `FF555F6D` } };
    row.getCell(2).font = { size: 10 };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.height = 16;
  }

  overview.addRow([]);

  const summaryLabel = overview.addRow(['SUMMARY', '']);
  overview.mergeCells(`A${summaryLabel.number}:B${summaryLabel.number}`);
  styleSectionLabel(summaryLabel);

  const summaryRow = overview.addRow(['', parsed.summary]);
  overview.mergeCells(`A${summaryRow.number}:B${summaryRow.number}`);
  summaryRow.getCell(1).value = parsed.summary;
  summaryRow.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  summaryRow.getCell(1).font = { size: 10 };
  summaryRow.height = Math.min(Math.ceil(parsed.summary.length / 80) * 15, 200);

  // ── Sheet 2: Risks ───────────────────────────────────────────────────────
  const risksSheet = workbook.addWorksheet('Risks');
  risksSheet.columns = [
    { key: 'risk', width: 40 },
    { key: 'severity', width: 12 },
    { key: 'source', width: 28 },
    { key: 'recommendation', width: 48 },
  ];

  const riskHeader = risksSheet.addRow(['Risk', 'Severity', 'Source', 'Recommendation']);
  styleHeader(riskHeader, NAVY);

  for (const r of parsed.risks) {
    const row = risksSheet.addRow([r.risk, r.severity, r.source, r.recommendation]);
    styleData(row);
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: riskColor(r.severity) } };
    row.getCell(2).font = { bold: true, size: 10 };
    row.height = 32;
  }

  if (parsed.risks.length === 0) {
    risksSheet.addRow(['No risks extracted.', '', '', '']);
  }

  // ── Sheet 3: Findings ────────────────────────────────────────────────────
  const findingsSheet = workbook.addWorksheet('Key Findings');
  findingsSheet.columns = [
    { key: 'num', width: 6 },
    { key: 'finding', width: 90 },
  ];

  const findHeader = findingsSheet.addRow(['#', 'Finding']);
  styleHeader(findHeader, BRASS, NAVY);

  parsed.findings.forEach((f, i) => {
    const row = findingsSheet.addRow([i + 1, f]);
    styleData(row);
    row.height = Math.max(20, Math.ceil(f.length / 90) * 15);
  });

  if (parsed.findings.length === 0) {
    findingsSheet.addRow(['', 'No findings extracted.']);
  }

  // ── Sheet 4: Follow-ups ──────────────────────────────────────────────────
  const followSheet = workbook.addWorksheet('Follow-ups');
  followSheet.columns = [
    { key: 'num', width: 6 },
    { key: 'action', width: 90 },
  ];

  const followHeader = followSheet.addRow(['#', 'Action Item']);
  styleHeader(followHeader, NAVY);

  parsed.followUps.forEach((f, i) => {
    const row = followSheet.addRow([i + 1, f]);
    styleData(row);
    row.height = Math.max(18, Math.ceil(f.length / 90) * 15);
  });

  if (parsed.followUps.length === 0) {
    followSheet.addRow(['', 'No follow-ups extracted.']);
  }

  // ── Sheet 5: Citations ───────────────────────────────────────────────────
  const citSheet = workbook.addWorksheet('Citations');
  citSheet.columns = [
    { key: 'num', width: 6 },
    { key: 'citation', width: 90 },
  ];

  const citHeader = citSheet.addRow(['#', 'Citation']);
  styleHeader(citHeader, NAVY);

  parsed.citations.forEach((c, i) => {
    const row = citSheet.addRow([i + 1, c]);
    styleData(row);
    row.height = Math.max(18, Math.ceil(c.length / 90) * 15);
  });

  if (parsed.citations.length === 0) {
    citSheet.addRow(['', 'No citations extracted.']);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
