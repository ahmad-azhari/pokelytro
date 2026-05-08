require('dotenv').config();
const mongoose = require('mongoose');
const Pokemon = require('../models/Pokemon');

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSION = 384;
const BATCH_SIZE = 10;

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

function buildPokemonChunkText(pokemon) {
  const typeString = pokemon.type2 ? `${pokemon.type1}/${pokemon.type2}` : pokemon.type1;
  const abilitiesString = [pokemon.ability1, pokemon.ability2, pokemon.hidden_ability]
    .filter(Boolean)
    .join(', ');

  return `Pokemon ${pokemon.name}. Pokedex number ${pokemon._id}. Types ${typeString}. ` +
    `Base stats HP ${pokemon.hp}, Attack ${pokemon.attack}, Defense ${pokemon.defense}, ` +
    `Special Attack ${pokemon.special_attack}, Special Defense ${pokemon.special_defense}, ` +
    `Speed ${pokemon.speed}, Total ${pokemon.total}. Abilities ${abilitiesString}. ` +
    `Height ${pokemon.height}m. Weight ${pokemon.weight}kg. Generation ${pokemon.generation}. ` +
    `Experience growth ${pokemon.experience_growth}. Catch rate ${pokemon.catch_rate}. ` +
    `Base friendship ${pokemon.base_friendship}.`;
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

async function fetchAllPokemonDocuments() {
  return await Pokemon.find({}).lean();
}

async function indexPokemonEmbeddingsInBatches(pokemonList) {
  const totalCount = pokemonList.length;

  console.log(`\n Indexing ${totalCount} Pokemon in batches of ${BATCH_SIZE}...`);

  for (let batchIndex = 0; batchIndex < pokemonList.length; batchIndex += BATCH_SIZE) {
    const batch = pokemonList.slice(batchIndex, batchIndex + BATCH_SIZE);
    const batchNumber = Math.floor(batchIndex / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(totalCount / BATCH_SIZE);

    console.log(`\n Batch ${batchNumber}/${totalBatches} (${batch.length} Pokemon)`);

    const embeddingPromises = batch.map(async (pokemon) => {
      const chunkText = buildPokemonChunkText(pokemon);
      const embeddingVector = await generateEmbeddingVector(chunkText);

      return {
        pokemonId: pokemon._id,
        embeddingVector,
      };
    });

    const embeddedBatch = await Promise.all(embeddingPromises);

    for (const item of embeddedBatch) {
      await Pokemon.findByIdAndUpdate(
        item.pokemonId,
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

async function verifyEmbeddingIndexing() {
  const pokemonWithEmbeddings = await Pokemon.countDocuments({
    embedding_vector: { $exists: true }
  });

  const totalPokemon = await Pokemon.countDocuments({});

  console.log(`\n Verification:`);
  console.log(`   Total Pokemon: ${totalPokemon}`);
  console.log(`   With embeddings: ${pokemonWithEmbeddings}`);
  console.log(`   Coverage: ${((pokemonWithEmbeddings / totalPokemon) * 100).toFixed(2)}%`);

  if (pokemonWithEmbeddings === totalPokemon) {
    console.log(` All Pokemon successfully indexed with embeddings!`);
  } else {
    console.log(`  ${totalPokemon - pokemonWithEmbeddings} Pokemon missing embeddings`);
  }
}

async function executeEmbeddingIndexation() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(` Pokemon Embedding Indexation Script Started`);
  console.log(`${'='.repeat(60)}`);

  try {
    await connectToDatabase();

    const allPokemon = await fetchAllPokemonDocuments();
    console.log(` Loaded ${allPokemon.length} Pokemon from database`);

    await indexPokemonEmbeddingsInBatches(allPokemon);

    await verifyEmbeddingIndexing();

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n  Total time: ${elapsedSeconds} seconds`);
    console.log(`${'='.repeat(60)}`);
    console.log(` Indexation completed successfully!`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error(`\n Error during indexation:`, error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await disconnectFromDatabase();
  }
}

executeEmbeddingIndexation();
