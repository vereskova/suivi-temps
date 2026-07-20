import React from "react";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { Align, Block, DocContent } from "./types";

const FONT = "Times-Roman";

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 12,
    fontFamily: FONT,
    lineHeight: 1.35,
  },
  title: { fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 10, textDecoration: "underline" },
  subtitle: { fontSize: 14, fontWeight: 700, textAlign: "center", marginBottom: 12 },
  heading: { fontSize: 14, fontWeight: 700, marginTop: 16, marginBottom: 8 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#999999", marginBottom: 10 },
  paragraphBase: { fontSize: 12, marginBottom: 8 },
  alignJustify: { textAlign: "justify" },
  alignCenter: { textAlign: "center" },
  alignRight: { textAlign: "right" },
  alignLeft: { textAlign: "left" },
  listItem: { fontSize: 12, marginBottom: 6, marginLeft: 14 },
  spacer: { height: 10 },
  bold: { fontWeight: 700 },
  italic: { fontStyle: "italic" },
  signatureRow: { flexDirection: "row", marginTop: 20 },
  signatureCol: { width: "48%", marginRight: "4%" },
  signatureLabel: { fontSize: 12, fontWeight: 700, marginBottom: 8 },
  signatureLine: { fontSize: 12, marginBottom: 4 },
});

function alignStyleFor(align: Align | undefined) {
  switch (align) {
    case "center":
      return styles.alignCenter;
    case "right":
      return styles.alignRight;
    case "left":
      return styles.alignLeft;
    default:
      return styles.alignJustify;
  }
}

function renderBlock(block: Block, index: number) {
  switch (block.type) {
    case "title":
      return (
        <Text key={index} style={styles.title}>
          {block.text}
        </Text>
      );
    case "subtitle":
      return (
        <Text key={index} style={styles.subtitle}>
          {block.text}
        </Text>
      );
    case "heading":
      return (
        <Text key={index} style={styles.heading}>
          {block.text}
        </Text>
      );
    case "rule":
      return <View key={index} style={styles.rule} />;
    case "spacer":
      return <View key={index} style={styles.spacer} />;
    case "list":
      return (
        <View key={index}>
          {block.items.map((item, i) => (
            <Text key={i} style={styles.listItem}>
              {"•  " + item}
            </Text>
          ))}
        </View>
      );
    case "signatureBlock":
      return (
        <View key={index} style={styles.signatureRow}>
          {[block.left, block.right].map((party, i) => (
            <View key={i} style={styles.signatureCol}>
              <Text style={styles.signatureLabel}>{party.label}</Text>
              {party.lines.map((line, j) => (
                <Text key={j} style={styles.signatureLine}>
                  {line}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case "paragraph":
      return (
        <Text key={index} style={[styles.paragraphBase, alignStyleFor(block.align)]}>
          {block.runs.map((r, i) => (
            <Text key={i} style={r.bold ? styles.bold : r.italic ? styles.italic : undefined}>
              {r.text}
            </Text>
          ))}
        </Text>
      );
  }
}

function DocPdf({ content }: { content: DocContent }) {
  return (
    <Document title={content.title}>
      <Page size="A4" style={styles.page}>
        {content.blocks.map((block, i) => renderBlock(block, i))}
      </Page>
    </Document>
  );
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk as Buffer));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function renderPdf(content: DocContent): Promise<Buffer> {
  const stream = await pdf(<DocPdf content={content} />).toBuffer();
  return streamToBuffer(stream);
}
