import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { Align, Block, DocContent, SignatureParty } from "./types";

const FONT = "Times New Roman";
const TITLE_SIZE = 32; // 16pt (docx sizes are in half-points)
const SUBTITLE_SIZE = 28; // 14pt
const HEADING_SIZE = 28; // 14pt
const BODY_SIZE = 24; // 12pt

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_CELL_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
};

function alignmentFor(align: Align | undefined): (typeof AlignmentType)[keyof typeof AlignmentType] {
  switch (align) {
    case "center":
      return AlignmentType.CENTER;
    case "right":
      return AlignmentType.RIGHT;
    case "left":
      return AlignmentType.LEFT;
    default:
      return AlignmentType.JUSTIFIED;
  }
}

function signatureCell(party: SignatureParty): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: NO_CELL_BORDERS,
    children: [
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: party.label, bold: true, font: FONT, size: BODY_SIZE })],
      }),
      ...party.lines.map(
        (line) =>
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: line, font: FONT, size: BODY_SIZE })],
          })
      ),
    ],
  });
}

function blockToNodes(block: Block): (Paragraph | Table)[] {
  switch (block.type) {
    case "title":
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: block.text, bold: true, font: FONT, size: TITLE_SIZE, underline: {} }),
          ],
        }),
      ];
    case "subtitle":
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: block.text, bold: true, font: FONT, size: SUBTITLE_SIZE })],
        }),
      ];
    case "heading":
      return [
        new Paragraph({
          spacing: { before: 300, after: 150 },
          children: [new TextRun({ text: block.text, bold: true, font: FONT, size: HEADING_SIZE })],
        }),
      ];
    case "rule":
      return [
        new Paragraph({
          spacing: { after: 200 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 4 },
          },
          children: [],
        }),
      ];
    case "spacer":
      return [new Paragraph({ text: "" })];
    case "list":
      return block.items.map(
        (item) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80, line: 276, lineRule: "auto" },
            children: [new TextRun({ text: item, font: FONT, size: BODY_SIZE })],
          })
      );
    case "signatureBlock":
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: NO_BORDER,
            bottom: NO_BORDER,
            left: NO_BORDER,
            right: NO_BORDER,
            insideHorizontal: NO_BORDER,
            insideVertical: NO_BORDER,
          },
          rows: [new TableRow({ children: [signatureCell(block.left), signatureCell(block.right)] })],
        }),
      ];
    case "paragraph":
      return [
        new Paragraph({
          alignment: alignmentFor(block.align),
          spacing: { after: 160, line: 276, lineRule: "auto" },
          children: block.runs.map(
            (r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, font: FONT, size: BODY_SIZE })
          ),
        }),
      ];
  }
}

export async function renderDocx(content: DocContent): Promise<Buffer> {
  const children = content.blocks.flatMap(blockToNodes);
  const document = new Document({
    title: content.title,
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY_SIZE } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } }, // ~2cm
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
