import React from "react";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { Block, DocContent } from "./types";

const styles = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 56, paddingHorizontal: 56, fontSize: 11, lineHeight: 1.4 },
  title: { fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 12, fontWeight: 700, textAlign: "center", marginBottom: 12 },
  heading: { fontSize: 12, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  paragraph: { marginBottom: 6, textAlign: "justify" },
  paragraphCenter: { marginBottom: 6, textAlign: "center" },
  listItem: { marginBottom: 4, marginLeft: 12 },
  spacer: { height: 10 },
  bold: { fontWeight: 700 },
  italic: { fontStyle: "italic" },
});

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
    case "paragraph":
      return (
        <Text key={index} style={block.center ? styles.paragraphCenter : styles.paragraph}>
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
