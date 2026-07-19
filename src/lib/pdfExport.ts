// lib/pdfExport.ts
// Client-side PDF generation for trade and signal history using jsPDF

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export interface ExportRow {
  [key: string]: string | number | boolean | null | undefined;
}

export interface ExportConfig {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: ExportRow[];
  columnMap: (keyof ExportRow)[];
  filename: string;
  orientation?: 'portrait' | 'landscape';
  summary?: Array<{ label: string; value: string }>;
}

export function generatePDF(config: ExportConfig): void {
  const doc = new jsPDF({
    orientation: config.orientation || 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 15;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(config.title, 14, yPos);

  // Subtitle
  if (config.subtitle) {
    yPos += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(config.subtitle, 14, yPos);
  }

  // Timestamp
  yPos += 6;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);

  // Summary section
  if (config.summary && config.summary.length > 0) {
    yPos += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50);
    doc.text('Summary', 14, yPos);
    yPos += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    config.summary.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 14 + col * 95;
      const y = yPos + row * 5;
      doc.setTextColor(80);
      doc.text(`${item.label}:`, x, y);
      doc.setTextColor(0);
      doc.text(item.value, x + 30, y);
    });

    if (config.summary.length > 2) {
      yPos += Math.ceil(config.summary.length / 2) * 5 + 5;
    } else {
      yPos += 10;
    }
  } else {
    yPos += 8;
  }

  // Data table
  const tableData = config.rows.map((row) =>
    config.columnMap.map((col) => {
      const val = row[col as string];
      if (val === null || val === undefined) return '-';
      if (typeof val === 'number') {
        if (Number.isInteger(val)) return val.toLocaleString();
        return val.toFixed(2);
      }
      return String(val);
    })
  );

  (doc as any).autoTable({
    head: [config.headers],
    body: tableData,
    startY: yPos,
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: [200, 200, 200],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { top: 10, bottom: 20 },
    pageBreak: 'auto',
    didDrawPage: (_data: any) => {
      // Footer
      const pageCount = (doc as any).getNumberOfPages();
      const pageNumber = (doc as any).getCurrentPageInfo()?.pageNumber || 1;
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `SniperBot - ${config.title} - Page ${pageNumber} of ${pageCount}`,
        10,
        doc.internal.pageSize.getHeight() - 10
      );
    },
  });

  // Save the PDF
  doc.save(`${config.filename}.pdf`);
}
