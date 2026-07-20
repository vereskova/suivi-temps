import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { Block, DocContent } from "./types";

function blockToParagraphs(block: Block): Paragraph[] {
  switch (block.type) {
    case "title":
      return [
        new Paragraph({
          text: block.text,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
      ];
    case "subtitle":
      return [
        new Paragraph({
          text: block.text,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
      ];
    case "heading":
      return [
        new Paragraph({
          text: block.text,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 150 },
        }),
      ];
    case "spacer":
      return [new Paragraph({ text: "" })];
    case "list":
      return block.items.map(
        (item) =>
          new Paragraph({
            text: item,
            bullet: { level: 0 },
            spacing: { after: 80 },
          })
      );
    case "paragraph":
      return [
        new Paragraph({
          alignment: block.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
          children: block.runs.map(
            (r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic })
          ),
        }),
      ];
  }
}

export async function renderDocx(content: DocContent): Promise<Buffer> {
  const paragraphs = content.blocks.flatMap(blockToParagraphs);
  const document = new Document({
    title: content.title,
    sections: [{ properties: {}, children: paragraphs }],
  });
  return Packer.toBuffer(document);
}
