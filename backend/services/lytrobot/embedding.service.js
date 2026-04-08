let extractorPromise = null;

async function getEmbeddingExtractor() {
  if (!extractorPromise) {
    extractorPromise = import("@xenova/transformers").then(({ pipeline }) =>
      pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2"),
    );
  }
  return extractorPromise;
}

async function embedText(text) {
  const extractor = await getEmbeddingExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

module.exports = {
  embedText,
};
