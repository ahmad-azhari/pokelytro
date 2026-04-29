const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSION = 384;

let pipeline = null;

async function loadPipeline() {
  if (!pipeline) {
    const { pipeline: pipelineFunc } = await import('@xenova/transformers');
    pipeline = pipelineFunc;
  }
  return pipeline;
}

class EmbeddingService {
  constructor() {
    this.embeddingPipeline = null;
    this.embeddingCache = new Map();
  }

  async initializeEmbeddingPipeline() {
    if (!this.embeddingPipeline) {
      const pipelineFunc = await loadPipeline();
      this.embeddingPipeline = await pipelineFunc('feature-extraction', EMBEDDING_MODEL);
    }
  }

  async generateEmbedding(textInput) {
    const cacheKey = Buffer.from(textInput).toString('base64');

    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
    }

    await this.initializeEmbeddingPipeline();

    const output = await this.embeddingPipeline(textInput, {
      pooling: 'mean',
      normalize: true,
    });

    const embeddingVector = Array.from(output.data);
    this.embeddingCache.set(cacheKey, embeddingVector);

    return embeddingVector;
  }

  async generateEmbeddingsForBatch(textInputArray) {
    return Promise.all(
      textInputArray.map((text) => this.generateEmbedding(text))
    );
  }

  clearEmbeddingCache() {
    this.embeddingCache.clear();
  }

  getEmbeddingDimension() {
    return EMBEDDING_DIMENSION;
  }

  getEmbeddingModel() {
    return EMBEDDING_MODEL;
  }
}

module.exports = new EmbeddingService();
