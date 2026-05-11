class ReRankingService {
  async reRankSearchResultsByRelevance(
    userQuery,
    searchResults,
    topK = 5
  ) {
    const scoredResults = searchResults.map((result) => ({
      ...result,
      relevanceScore: this.calculateRelevanceScore(userQuery, result),
    }));

    const sortedResults = scoredResults.sort(
      (a, b) => b.relevanceScore - a.relevanceScore
    );

    return sortedResults.slice(0, topK);
  }

  calculateRelevanceScore(userQuery, searchResult) {
    let score = searchResult.similarity || 0;

    score += this.calculateKeywordMatchBonus(userQuery, searchResult);
    score += this.calculateSourceTypeBonus(searchResult);
    score += this.calculateMetadataRelevanceBonus(userQuery, searchResult);

    return Math.min(score, 2.0);
  }

  calculateKeywordMatchBonus(userQuery, searchResult) {
    const lowerQuery = userQuery.toLowerCase();
    const lowerTitle = searchResult.title?.toLowerCase() || '';

    if (lowerTitle.includes(lowerQuery)) {
      return 0.3;
    }

    const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 2);
    const titleWords = lowerTitle.split(/\s+/);

    const matchedWords = queryWords.filter((qWord) =>
      titleWords.some((tWord) => tWord.includes(qWord) || qWord.includes(tWord))
    );

    return (matchedWords.length / Math.max(queryWords.length, 1)) * 0.2;
  }

  calculateSourceTypeBonus(searchResult) {
    const sourceBonus = {
      pokemon: 0.2,
      type_matchup: 0.15,
      strategy: 0.15,
      location: 0.1,
    };

    return sourceBonus[searchResult.sourceType] || 0;
  }

  calculateMetadataRelevanceBonus(userQuery, searchResult) {
    if (!searchResult.metadata) {
      return 0;
    }

    let bonus = 0;

    if (searchResult.sourceType === 'pokemon' && searchResult.metadata.stats) {
      const queryLower = userQuery.toLowerCase();
      if (queryLower.includes('stat') || queryLower.includes('total')) {
        bonus += 0.1;
      }
    }

    if (searchResult.sourceType === 'type_matchup') {
      const queryLower = userQuery.toLowerCase();
      if (
        queryLower.includes('type') ||
        queryLower.includes('advantage') ||
        queryLower.includes('effective')
      ) {
        bonus += 0.1;
      }
    }

    return bonus;
  }

  deduplicateAndMergeResults(resultBatches) {
    const seenChunkIds = new Set();
    const dedupedResults = [];

    resultBatches.forEach((batchResults) => {
      batchResults.forEach((result) => {
        if (!seenChunkIds.has(result.chunkId)) {
          seenChunkIds.add(result.chunkId);
          dedupedResults.push(result);
        }
      });
    });

    return dedupedResults;
  }

  sortResultsByScore(results) {
    return results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  }
}

module.exports = new ReRankingService();
