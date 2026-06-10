import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, PageBreak
} from "docx";
import { saveAs } from "file-saver";

const SEVERITY_HEX = {
  Critical: { fill: "FEE2E2", text: "991B1B", bar: "DC2626" },
  High:     { fill: "FFEDD5", text: "9A3412", bar: "EA580C" },
  Medium:   { fill: "FEF9C3", text: "854D0E", bar: "CA8A04" },
  Low:      { fill: "DCFCE7", text: "166534", bar: "16A34A" },
  Info:     { fill: "DBEAFE", text: "1E40AF", bar: "2563EB" },
};

const tableW = 9360;
const bDef = (color = "CCCCCC") => ({ style: BorderStyle.SINGLE, size: 1, color });
const allBorders = (c) => ({ top: bDef(c), bottom: bDef(c), left: bDef(c), right: bDef(c) });
const cellW = (size) => ({ size, type: WidthType.DXA });
const margins = { top: 80, bottom: 80, left: 120, right: 120 };

function hCell(text, width, fill = "1E3A5F") {
  return new TableCell({
    width: cellW(width), borders: allBorders(fill),
    shading: { fill, type: ShadingType.CLEAR }, margins,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20 })] })]
  });
}

function dCell(text, width, fill = "FFFFFF") {
  return new TableCell({
    width: cellW(width), borders: allBorders("DDDDDD"),
    shading: { fill, type: ShadingType.CLEAR }, margins,
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? "—"), size: 20 })] })]
  });
}

function colorCell(text, width, fill, textColor) {
  return new TableCell({
    width: cellW(width), borders: allBorders("DDDDDD"),
    shading: { fill, type: ShadingType.CLEAR }, margins,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: textColor, size: 20 })] })]
  });
}

export async function generateAndDownload(data) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
  data.vulnerabilities.forEach(v => { if (counts[v.severity] !== undefined) counts[v.severity]++; });

  const riskLabel = { Critical: "Immediate action required", High: "Urgent remediation needed", Medium: "Remediate within 30 days", Low: "Remediate within 90 days", Info: "Monitor" };

  const summaryRows = [
    new TableRow({ children: ["Severity", "Count", "Risk Level"].map((h, i) => hCell(h, [2400, 2000, 4960][i])) }),
    ...Object.entries(counts).map(([sev, cnt]) => {
      const c = SEVERITY_HEX[sev];
      return new TableRow({ children: [
        colorCell(sev, 2400, c.fill, c.text),
        dCell(String(cnt), 2000, c.fill),
        dCell(cnt > 0 ? riskLabel[sev] : "None found", 4960),
      ]});
    })
  ];

  const overviewRows = [
    new TableRow({ children: ["#", "ID / CVE", "Title", "Severity", "CVSS", "Affected System"].map((h, i) => hCell(h, [500, 1440, 2960, 1320, 720, 2420][i])) }),
    ...data.vulnerabilities.map((v, i) => {
      const c = SEVERITY_HEX[v.severity] || SEVERITY_HEX.Info;
      return new TableRow({ children: [
        dCell(String(i + 1), 500),
        dCell(v.id || "—", 1440),
        dCell(v.title || "—", 2960),
        colorCell(v.severity, 1320, c.fill, c.text),
        dCell(v.cvssScore ? String(v.cvssScore) : "—", 720),
        dCell(v.affectedSystem || "—", 2420),
      ]});
    })
  ];

  const detailSections = data.vulnerabilities.flatMap((v, i) => {
    const c = SEVERITY_HEX[v.severity] || SEVERITY_HEX.Info;
    return [
      new Paragraph({
        spacing: { before: 320, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: c.bar, space: 1 } },
        children: [
          new TextRun({ text: `${i + 1}. `, bold: true, size: 26, color: "94A3B8" }),
          new TextRun({ text: v.title || "Unnamed Finding", bold: true, size: 26, color: "0F172A" }),
          new TextRun({ text: `  [${v.severity}]`, bold: true, size: 22, color: c.bar }),
        ]
      }),
      new Table({
        width: { size: tableW, type: WidthType.DXA },
        columnWidths: [2000, 7360],
        rows: [
          ["CVE / ID", v.id || "—"],
          ["CVSS Score", v.cvssScore ? String(v.cvssScore) : "—"],
          ["Severity", v.severity],
          ["Affected System", v.affectedSystem || "—"],
        ].map(([label, val]) => new TableRow({ children: [hCell(label, 2000, "334155"), dCell(val, 7360)] }))
      }),
      new Paragraph({ spacing: { before: 160, after: 40 }, children: [new TextRun({ text: "Description", bold: true, size: 22, color: "1E3A5F" })] }),
      new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: v.description || "No description provided.", size: 20, color: "374151" })] }),
      new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Recommendation", bold: true, size: 22, color: "166534" })] }),
      new Paragraph({ spacing: { after: 280 }, children: [new TextRun({ text: v.recommendation || "No recommendation provided.", size: 20, color: "374151" })] }),
    ];
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 } }
      },
      children: [
        // Cover
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1800, after: 240 }, children: [new TextRun({ text: data.reportTitle || "Vulnerability Assessment Report", bold: true, size: 56, color: "1E3A5F" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: data.targetOrg || "—", size: 30, color: "475569" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: `Scan Date: ${data.scanDate || "—"}`, size: 22, color: "64748B" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: `Assessor / Tool: ${data.assessor || "—"}`, size: 22, color: "64748B" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: `Scope: ${data.scope || "—"}`, size: 22, color: "64748B" })] }),
        new Paragraph({ children: [new PageBreak()] }),

        // Executive Summary
        new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: "1. Executive Summary", bold: true, size: 32, color: "1E3A5F" })] }),
        new Paragraph({ spacing: { after: 280 }, children: [new TextRun({ text: data.executiveSummary || "No executive summary provided.", size: 22, color: "374151" })] }),

        // Severity Summary
        new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: "2. Vulnerability Summary", bold: true, size: 32, color: "1E3A5F" })] }),
        new Table({ width: { size: tableW, type: WidthType.DXA }, columnWidths: [2400, 2000, 4960], rows: summaryRows }),
        new Paragraph({ spacing: { after: 280 } }),

        // Findings Overview
        new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: "3. Findings Overview", bold: true, size: 32, color: "1E3A5F" })] }),
        ...(data.vulnerabilities.length > 0
          ? [new Table({ width: { size: tableW, type: WidthType.DXA }, columnWidths: [500, 1440, 2960, 1320, 720, 2420], rows: overviewRows })]
          : [new Paragraph({ children: [new TextRun({ text: "No vulnerabilities identified.", size: 22 })] })]),
        new Paragraph({ children: [new PageBreak()] }),

        // Detailed Findings
        new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: "4. Detailed Findings", bold: true, size: 32, color: "1E3A5F" })] }),
        ...(data.vulnerabilities.length > 0 ? detailSections : [new Paragraph({ children: [new TextRun({ text: "No vulnerabilities to detail.", size: 22 })] })]),
        new Paragraph({ children: [new PageBreak()] }),

        // Disclaimer
        new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: "5. Disclaimer", bold: true, size: 32, color: "1E3A5F" })] }),
        new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "This report was generated automatically from a vulnerability scan. Results should be reviewed by a qualified security professional. The information contained herein is confidential and intended solely for the organization named above.", size: 20, color: "64748B" })] }),
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Vulnerability_Report_${data.targetOrg || "Report"}_${new Date().toISOString().slice(0, 10)}.docx`);
}
