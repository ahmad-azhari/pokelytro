const Pokemon = require('../../models/Pokemon');
const Type = require('../../models/Type');

class VectorSearchService {
  async searchPokemonByEmbedding(embeddingVector, topK = 20) {
    try {
      const results = await Pokemon.aggregate([
        {
          $vectorSearch: {
            queryVector: embeddingVector,
            k: topK,
            path: 'embedding_vector',
            index: 'pokemon_embedding_index',
            numCandidates: topK * 5,
            limit: topK,
          },
        },
        {
          $project: {
            similarityScore: { $meta: 'vectorSearchScore' },
            _id: 1,
            name: 1,
            type1: 1,
            type2: 1,
            hp: 1,
            attack: 1,
            defense: 1,
            special_attack: 1,
            special_defense: 1,
            speed: 1,
            total: 1,
            generation: 1,
            ability1: 1,
            ability2: 1,
            hidden_ability: 1,
            height: 1,
            weight: 1,
          },
        },
      ]);

      return results.map((doc) => ({
        sourceType: 'pokemon',
        sourceId: String(doc._id),
        title: doc.name,
        chunkId: `pokemon:${doc._id}`,
        similarity: doc.similarityScore,
        metadata: {
          name: doc.name,
          type1: doc.type1,
          type2: doc.type2,
          generation: doc.generation,
          stats: {
            hp: doc.hp,
            attack: doc.attack,
            defense: doc.defense,
            special_attack: doc.special_attack,
            special_defense: doc.special_defense,
            speed: doc.speed,
            total: doc.total,
          },
          abilities: [doc.ability1, doc.ability2, doc.hidden_ability].filter(Boolean),
          height: doc.height,
          weight: doc.weight,
        },
      }));
    } catch (error) {
      throw new Error('Pokemon vector search failed');
    }
  }

  async searchTypeMatchupsByEmbedding(embeddingVector, topK = 10, typeFilter = null) {
    try {
      const pipeline = [
        {
          $vectorSearch: {
            queryVector: embeddingVector,
            k: topK,
            path: 'embedding_vector',
            index: 'type_embedding_index',
            numCandidates: topK * 20,
            limit: topK * 5,
          },
        },
      ];

      if (typeFilter && typeFilter.length > 0) {
        pipeline.push({
          $match: {
            $or: [
              { atacante: { $in: typeFilter } },
              { defensor: { $in: typeFilter } },
            ],
          },
        });
      }

      pipeline.push({
        $limit: topK,
      });

      pipeline.push({
        $project: {
          similarityScore: { $meta: 'vectorSearchScore' },
          _id: 1,
          atacante: 1,
          defensor: 1,
          multiplicador: 1,
        },
      });

      const results = await Type.aggregate(pipeline);

      return results.map((doc) => ({
        sourceType: 'type_matchup',
        sourceId: `${doc.atacante}:${doc.defensor}`,
        title: `${doc.atacante} vs ${doc.defensor}`,
        chunkId: `type:${doc.atacante}:${doc.defensor}`,
        similarity: doc.similarityScore,
        metadata: {
          attackingType: doc.atacante,
          defenderType: doc.defensor,
          multiplier: doc.multiplicador,
          effectiveness: this.describeTypeEffectiveness(doc.multiplicador),
        },
      }));
    } catch (error) {
      throw new Error('Type matchup vector search failed');
    }
  }

  describeTypeEffectiveness(multiplier) {
    if (multiplier > 1) return 'super_effective';
    if (multiplier < 1) return 'not_very_effective';
    return 'neutral';
  }

  async performParallelVectorSearches(embeddingVectorArray, topKPerSearch = 20, queryDomain = null, detectedTypes = null) {
    const domainToCollectionsMap = {
      type_matchup: ['pokemon', 'types'],
      stats: ['pokemon'],
      strategy: ['pokemon'],
      evolution: ['pokemon'],
      location: ['pokemon'],
      general: ['pokemon', 'types'],
    };

    const targetCollections = domainToCollectionsMap[queryDomain] || ['pokemon', 'types'];

    const allSearches = [];

    if (targetCollections.includes('pokemon')) {
      const pokemonSearches = embeddingVectorArray.map((embedding) =>
        this.searchPokemonByEmbedding(embedding, topKPerSearch)
      );
      allSearches.push(...pokemonSearches);
    }

    if (targetCollections.includes('types')) {
      const typeSearches = embeddingVectorArray.map((embedding) =>
        this.searchTypeMatchupsByEmbedding(embedding, Math.ceil(topKPerSearch / 2), detectedTypes)
      );
      allSearches.push(...typeSearches);
    }

    const searchResults = await Promise.all(allSearches);

    return searchResults;
  }

  deduplicateSearchResults(resultArrays) {
    const uniqueByChunkId = new Map();

    resultArrays.forEach((resultsArray) => {
      resultsArray.forEach((result) => {
        if (!uniqueByChunkId.has(result.chunkId)) {
          uniqueByChunkId.set(result.chunkId, result);
        } else {
          const existing = uniqueByChunkId.get(result.chunkId);
          if (result.similarity > existing.similarity) {
            uniqueByChunkId.set(result.chunkId, result);
          }
        }
      });
    });

    return Array.from(uniqueByChunkId.values());
  }
}

module.exports = new VectorSearchService();
