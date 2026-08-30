// main.mjs — assembly: cover (R1/DM-1 RTL) + TOC section (Roman) + body (Arabic numerals)
// Per toc.md 3-section architecture; no trailing PageBreak (section break handles it).
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, SectionType,
  NumberFormat, TableOfContents, PageBreak,
} from "docx";
import fs from "node:fs";
import path from "node:path";
import { P, buildCoverR1RTL, pageFooter, docHeader, ar } from "./lib.mjs";
import { content1 } from "./content1.mjs";
import { content2 } from "./content2.mjs";

const OUT = process.argv[2] ?? path.join(process.cwd(), "download", "مواصفات-نظام-HAMD-وجاهزية-النشر.docx");

// ── cover config ──
const coverConfig = {
  title: "مواصفات نظام H.A.M.D ERP",
  titleLines: ["مواصفات نظام", "H.A.M.D ERP"], // semantic break — Latin brand kept whole
  subtitle: "تقييم جاهزية النشر الإنتاجي والمواصفات الفنية الشاملة — مع تحليل فجوات النشر وخطة إغلاقها",
  englishLabel: "H.A.M.D ERP — SYSTEM SPECIFICATION & DEPLOYMENT READINESS",
  metaLines: [
    "المرجع البرمجي: aa6d81b (production-deployment-ready) فوق afcff27",
    "التاريخ: 29 أغسطس 2026 — القرار الحالي: GO",
    "الإصدار: 1.0 — وثيقة داخلية لفريق التشغيل",
  ],
  footerText: "H.A.M.D ERP — نظام متكامل لنقاط البيع والمخازن والفواتير",
  palette: P,
};

const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1417, right: 1701 }; // mirrored L/R for RTL

const HEADER_TITLE = "مواصفات نظام H.A.M.D ERP وجاهزية النشر الإنتاجي";

// ── TOC section children (toc.md: title WITHOUT heading style, TOC element,
//    Arabic refresh hint; NO trailing PageBreak — next section is NEXT_PAGE) ──
const tocChildren = [
  new Paragraph({
    bidirectional: true, alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 360, line: 380, lineRule: "atLeast" },
    children: [ar("المحتويات", { bold: true, size: 32, color: P.headingInk })],
  }),
  new TableOfContents("Table of Contents", {
    hyperlink: true,
    headingStyleRange: "1-2",
  }),
  new Paragraph({
    bidirectional: true, spacing: { before: 200, line: 276 },
    children: [ar(
      "ملاحظة: هذه القائمة مولّدة بحقول آلية؛ لضمان دقة أرقام الصفحات بعد أي تعديل، انقر بزر الفأرة الأيمن على القائمة واختر تحديث الحقل.",
      { italics: true, size: 18, color: "888888" },
    )],
  }),
];

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" }, size: 24, color: "000000" },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" }, size: 32, bold: true, color: P.headingInk },
        paragraph: { spacing: { before: 360, after: 160, line: 380 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" }, size: 28, bold: true, color: P.headingInk },
        paragraph: { spacing: { before: 240, after: 120, line: 350 }, outlineLevel: 1 },
      },
    },
  },
  sections: [
    // ── Section 1: Cover — margin 0, no footer/header, no pageNumbers ──
    {
      properties: {
        page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } },
      },
      children: buildCoverR1RTL(coverConfig),
    },
    // ── Section 2: TOC — Roman numerals ──
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      headers: { default: docHeader(HEADER_TITLE) },
      footers: { default: pageFooter() },
      children: tocChildren,
    },
    // ── Section 3: Body — Arabic numerals, reset to 1 ──
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader(HEADER_TITLE) },
      footers: { default: pageFooter() },
      children: [...content1, ...content2],
    },
  ],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buf);
console.log("WROTE", OUT, buf.length, "bytes");
