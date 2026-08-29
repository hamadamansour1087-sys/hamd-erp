// lib.mjs — RTL Arabic docx helpers + mirrored R1 cover (DM-1 palette)
// Follows docx skill: design-system.md (R1, calcTitleLayout, calcCoverSpacing,
// Cover Non-Negotiables), common-rules.md (Rule 8/9, WPS-safe), docx-js-core.md.
import {
  Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, TableLayoutType, PageNumber, Header, Footer,
} from "docx";

// ── Palette DM-1 (Deep Cyan — tech) from design-system.md ──
export const P = {
  bg: "162235", primary: "FFFFFF", accent: "37DCF2",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  // darkened accent for white-page tables (per Dark Cover → Light Table Rule)
  table: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
  headingInk: "162235", body: "000000",
};

const AR_FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" };

// ── safe text guard (common-rules.md mandatory) ──
export function safeText(v, ph) {
  if (v === undefined || v === null || v === "" || String(v) === "NaN" || String(v) === "undefined") {
    return ph || "【يرجى التعبئة】";
  }
  return String(v);
}

// ── RTL run/paragraph helpers ──
export function ar(text, opts = {}) {
  return new TextRun({ text: safeText(text), rightToLeft: true, font: AR_FONT, size: 24, color: P.body, ...opts });
}

export function bodyP(text, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: [ar(text, opts.run || {})],
    ...opts.para,
  });
}

// paragraph with bold lead-in + rest
export function leadP(lead, rest) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: [ar(lead, { bold: true, color: P.headingInk }), ar(" " + rest)],
  });
}

export function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, bidirectional: true,
    spacing: { before: 360, after: 160, line: 380, lineRule: "atLeast" },
    children: [ar(text, { bold: true, size: 32, color: P.headingInk })],
  });
}
export function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, bidirectional: true,
    spacing: { before: 240, after: 120, line: 350, lineRule: "atLeast" },
    children: [ar(text, { bold: true, size: 28, color: P.headingInk })],
  });
}

// ── RTL data table (percentage widths, WPS-safe, cross-page controlled) ──
export function dataTable(headers, rows, widths) {
  const mk = (text, isHead, w, i) => new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE },
    shading: isHead
      ? { type: ShadingType.CLEAR, fill: P.table.headerBg }
      : (i % 2 === 1 ? { type: ShadingType.CLEAR, fill: P.table.surface } : undefined),
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({
      bidirectional: true,
      spacing: { line: 276 },
      children: [ar(text, { bold: isHead, size: 21, color: isHead ? P.table.headerText : P.body })],
    })],
  });
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((t, j) => mk(t, true, widths[j], 0)) }),
      ...rows.map((r, i) => new TableRow({ cantSplit: true, children: r.map((t, j) => mk(t, false, widths[j], i)) })),
    ],
  });
}

export function tableTitle(text) {
  return new Paragraph({
    bidirectional: true, keepNext: true, spacing: { before: 160, after: 80, line: 312 },
    children: [ar(text, { bold: true, size: 21, color: P.headingInk })],
  });
}

// ── design-system.md: calcTitleLayout + splitTitleLines + calcCoverSpacing ──
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."،。、؛：！؟,.;:!?", ..."-_—–·/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

export function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20; // CJK-conservative estimate — safe for Arabic too
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

export function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ── Cover R1 mirrored for RTL (structure per design-system.md: single 16838
//    wrapper, allNoBorders, exact height, zero nested tables) ──
const NO_B = { style: BorderStyle.NONE, size: 0, color: "auto" };
export const allNoBorders = {
  top: NO_B, bottom: NO_B, left: NO_B, right: NO_B,
  insideHorizontal: NO_B, insideVertical: NO_B,
};
const noBorders = { top: NO_B, bottom: NO_B, left: NO_B, right: NO_B };

export function buildCoverR1RTL(config) {
  const C = config.palette;
  const padL = 1200, padR = 1200; // mirrored: main padding on the RIGHT
  const availableWidth = 11906 - padL - padR - 300;
  // Explicit semantic lines win when provided (fit-checked); otherwise auto-calc.
  // Arabic glyphs ≈ pt*11 twips — narrower than the CJK pt*20 estimate.
  let titlePt, titleLines;
  if (config.titleLines?.length) {
    titleLines = config.titleLines;
    const longest = Math.max(...titleLines.map((l) => l.length));
    titlePt = Math.min(40, Math.floor(availableWidth / (longest * 11)));
    titlePt = Math.max(titlePt, 24);
  } else {
    ({ titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24));
  }
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 12 };
  const children = [];

  // 1. dynamic top whitespace
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));

  // 2. English label with accent bottom border (LTR run, right-positioned)
  if (config.englishLabel) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      indent: { left: padR, right: padL }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel, size: 18, color: C.accent, font: AR_FONT, characterSpacing: 40 })],
    }));
  }

  // 3. main title (dynamic size + smart breaks, RTL)
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      bidirectional: true, indent: { right: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], rightToLeft: true, size: titleSize, bold: true, color: C.cover.titleColor, font: AR_FONT })],
    }));
  }

  // 4. subtitle
  if (config.subtitle) {
    children.push(new Paragraph({
      bidirectional: true, indent: { right: padL }, spacing: { after: 800, line: 340, lineRule: "atLeast" },
      children: [new TextRun({ text: config.subtitle, rightToLeft: true, size: 24, color: C.cover.subtitleColor, font: AR_FONT })],
    }));
  }

  // 5. meta lines with RIGHT accent border (mirrored)
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      bidirectional: true, indent: { right: padL + 200, left: padR }, spacing: { after: 80, line: 300, lineRule: "atLeast" },
      border: { right: accentRight },
      children: [new TextRun({ text: line, rightToLeft: true, size: 24, color: C.cover.metaColor, font: AR_FONT })],
    }));
  }

  // 6. dynamic bottom whitespace
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));

  // 7. footer with top accent separator
  children.push(new Paragraph({
    bidirectional: true, indent: { right: padL, left: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.accent, space: 8 } },
    spacing: { before: 200 },
    children: [new TextRun({
      text: safeText(config.footerText),
      rightToLeft: true, size: 16, color: C.cover.footerColor, font: AR_FONT,
    })],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.bg }, borders: noBorders,
        verticalAlign: "top",
        children,
      })],
    })],
  })];
}

// ── footer/header builders (format switch patched in post-processing) ──
export function pageFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: AR_FONT })],
    })],
  });
}
export function docHeader(title) {
  return new Header({
    children: [new Paragraph({
      bidirectional: true, alignment: AlignmentType.CENTER, spacing: { line: 240 },
      children: [ar(title, { size: 18, color: "808080" })],
    })],
  });
}
