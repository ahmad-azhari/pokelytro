require('dotenv').config();
const mongoose = require('mongoose');
const Type = require('../models/Type');

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSION = 384;
const BATCH_SIZE = 20;

let embeddingPipeline = null;

async function loadEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log(' Loading embedding model...');
    const { pipeline } = await import('@xenova/transformers');
    embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL);
  }
  return embeddingPipeline;
}

async function generateEmbeddingVector(textInput) {
  const extractor = await loadEmbeddingPipeline();
  const output = await extractor(textInput, {
    pooling: 'mean',
    normalize: true
  });
  return Array.from(output.data);
}

function buildTypeMatchupChunkText(typeRow) {
  return `Type matchup effectiveness. Attacking type ${typeRow.atacante} ` +
    `against defending type ${typeRow.defensor}. ` +
    `Damage multiplier ${typeRow.multiplicador}. ` +
    `${typeRow.multiplicador > 1 ? 'Super effective' : typeRow.multiplicador < 1 ? 'Not very effective' : 'Neutral'}.`;
}

async function connectToDatabase() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pokelytro';

  if (mongoose.connection.readyState !== 0) {
    console.log(' Already connected to MongoDB');
    return;
  }

  console.log(' Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log(' Connected to MongoDB');
}

async function disconnectFromDatabase() {
  await mongoose.disconnect();
  console.log(' Disconnected from MongoDB');
}

async function fetchAllTypeMatchupDocuments() {
  return await Type.find({}).lean();
}

async function indexTypeMatchupEmbeddingsInBatches(typeMatchupList) {
  const totalCount = typeMatchupList.length;

  console.log(`\n Indexing ${totalCount} type matchups in batches of ${BATCH_SIZE}...`);

  for (let batchIndex = 0; batchIndex < typeMatchupList.length; batchIndex += BATCH_SIZE) {
    const batch = typeMatchupList.slice(batchIndex, batchIndex + BATCH_SIZE);
    const batchNumber = Math.floor(batchIndex / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(totalCount / BATCH_SIZE);

    console.log(`\n Batch ${batchNumber}/${totalBatches} (${batch.length} type matchups)`);

    const embeddingPromises = batch.map(async (typeRow) => {
      const chunkText = buildTypeMatchupChunkText(typeRow);
      const embeddingVector = await generateEmbeddingVector(chunkText);

      return {
        typeId: typeRow._id,
        embeddingVector,
      };
    });

    const embeddedBatch = await Promise.all(embeddingPromises);

    for (const item of embeddedBatch) {
      await Type.findByIdAndUpdate(
        item.typeId,
        {
          embedding_vector: item.embeddingVector,
          embedding_dimension: EMBEDDING_DIMENSION,
          embedding_model: EMBEDDING_MODEL,
          embedding_indexed_at: new Date(),
        },
        { new: true }
      );
    }

    const bulkWriteResult = { modifiedCount: embeddedBatch.length };

    const progressPercentage = Math.round(
      ((batchIndex + batch.length) / totalCount) * 100
    );

    console.log(
      ` Batch ${batchNumber} complete: ${bulkWriteResult.modifiedCount} updated (${progressPercentage}%)`
    );
  }
}

async function verifyTypeMatchupIndexing() {
  const typeMatchupsWithEmbeddings = await Type.countDocuments({
    embedding_vector: { $exists: true }
  });

  const totalTypeMatchups = await Type.countDocuments({});

  console.log(`\n Verification:`);
  console.log(`   Total type matchups: ${totalTypeMatchups}`);
  console.log(`   With embeddings: ${typeMatchupsWithEmbeddings}`);
  console.log(`   Coverage: ${((typeMatchupsWithEmbeddings / totalTypeMatchups) * 100).toFixed(2)}%`);

  if (typeMatchupsWithEmbeddings === totalTypeMatchups) {
    console.log(` All type matchups successfully indexed with embeddings!`);
  } else {
    console.log(`  ${totalTypeMatchups - typeMatchupsWithEmbeddings} type matchups missing embeddings`);
  }
}

async function executeTypeMatchupIndexation() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(` Type Matchup Embedding Indexation Script Started`);
  console.log(`${'='.repeat(60)}`);

  try {
    await connectToDatabase();

    const allTypeMatchups = await fetchAllTypeMatchupDocuments();
    console.log(` Loaded ${allTypeMatchups.length} type matchups from database`);

    await indexTypeMatchupEmbeddingsInBatches(allTypeMatchups);

    await verifyTypeMatchupIndexing();

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n  Total time: ${elapsedSeconds} seconds`);
    console.log(`${'='.repeat(60)}`);
    console.log(` Type matchup indexation completed successfully!`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error(`\n Error during indexation:`, error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await disconnectFromDatabase();
  }
}

executeTypeMatchupIndexation();
