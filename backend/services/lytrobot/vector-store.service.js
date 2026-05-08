const KnowledgeChunk = require("../../models/KnowledgeChunk");
const Pokemon = require("../../models/Pokemon");
const Type = require("../../models/Type");
const EmbeddingService = require("./EmbeddingService");

let isBuilding = false;
let isReady = false;

function createPokemonChunk(pokemon) {
  const typeText = pokemon.type2 ? `${pokemon.type1}/${pokemon.type2}` : pokemon.type1;
  const abilities = [pokemon.ability1, pokemon.ability2, pokemon.hidden_ability].filter(Boolean).join(", ");
  const text = `Pokemon ${pokemon.name}. Pokedex number ${pokemon._id}. Types ${typeText}. Base stats HP ${pokemon.hp}, Attack ${pokemon.attack}, Defense ${pokemon.defense}, Special Attack ${pokemon.special_attack}, Special Defense ${pokemon.special_defense}, Speed ${pokemon.speed}, Total ${pokemon.total}. Abilities ${abilities}. Height ${pokemon.height}m. Weight ${pokemon.weight}kg. Generation ${pokemon.generation}. ${pokemon.evolution_method ? `Evolution method ${pokemon.evolution_method}.` : ""}`;

  return {
    chunkId: `pokemon:${pokemon._id}`,
    sourceType: "pokemon",
    sourceId: String(pokemon._id),
    title: pokemon.name,
    text,
    metadata: {
      name: pokemon.name,
      type1: pokemon.type1,
      type2: pokemon.type2 || null,
      generation: pokemon.generation,
      total: pokemon.total,
    },
  };
}

function createTypeChunk(typeRow, index) {
  return {
    chunkId: `type:${index}:${typeRow.attacking_type}:${typeRow.defender_type}`,
    sourceType: "type_matchup",
    sourceId: `${typeRow.attacking_type}:${typeRow.defender_type}`,
    title: `${typeRow.attacking_type} vs ${typeRow.defender_type}`,
    text: `Type matchup. Attacking type ${typeRow.attacking_type}. Defender type ${typeRow.defender_type}. Multiplier ${typeRow.multiplier}.`,
    metadata: {
      attackingType: typeRow.attacking_type,
      defenderType: typeRow.defender_type,
      multiplier: typeRow.multiplier,
    },
  };
}

function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
    return -1;
  }
  let sum = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    sum += vecA[i] * vecB[i];
  }
  return sum;
}

async function buildKnowledgeBase() {
  if (isReady || isBuilding) {
    return;
  }

  isBuilding = true;

  try {
    const [pokemons, typeRows] = await Promise.all([
      Pokemon.find({}).lean(),
      Type.find({}).lean(),
    ]);

    const chunks = [
      ...pokemons.map(createPokemonChunk),
      ...typeRows.map((row, index) => createTypeChunk(row, index)),
      {
        chunkId: "summary:pokemon_count",
        sourceType: "summary",
        sourceId: "pokemon_count",
        title: "Pokemon Count",
        text: `Pokelytro database currently stores ${pokemons.length} Pokemon entries.`,
        metadata: { totalPokemons: pokemons.length },
      },
    ];

    const operations = [];

    for (const chunk of chunks) {
      const embedding = await EmbeddingService.generateEmbedding(chunk.text);
      operations.push({
        replaceOne: {
          filter: { chunkId: chunk.chunkId },
          replacement: {
            ...chunk,
            embedding,
          },
          upsert: true,
        },
      });
    }

    if (operations.length > 0) {
      await KnowledgeChunk.bulkWrite(operations);
    }

    await KnowledgeChunk.deleteMany({ chunkId: { $nin: chunks.map((chunk) => chunk.chunkId) } });

    isReady = true;
  } finally {
    isBuilding = false;
  }
}

async function retrieveKnowledge(query, topK = 6) {
  if (!isReady) {
    await buildKnowledgeBase();
  }

  const queryEmbedding = await EmbeddingService.generateEmbedding(query);
  const chunks = await KnowledgeChunk.find({}, { embedding: 1, title: 1, text: 1, sourceType: 1, sourceId: 1, metadata: 1 }).lean();

  const scored = chunks
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => ({
      title: item.chunk.title,
      text: item.chunk.text,
      sourceType: item.chunk.sourceType,
      sourceId: item.chunk.sourceId,
      metadata: item.chunk.metadata,
      score: item.score,
    }));

  return scored;
}

module.exports = {
  buildKnowledgeBase,
  retrieveKnowledge,
};
