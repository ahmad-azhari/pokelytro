const EmbeddingService = require('./EmbeddingService');
const VectorSearchService = require('./VectorSearchService');
const QueryExpansionService = require('./QueryExpansionService');
const ReRankingService = require('./ReRankingService');
const LLMService = require('./LLMService');

class RAGOrchestrator {
  async executeFullRAGPipeline(userMessage, conversationHistory) {
    try {
      const queryDomain = await QueryExpansionService.detectQueryDomain(
        userMessage
      );

      const queryVariants =
        await QueryExpansionService.generateQueryVariants(userMessage, queryDomain);

      const embeddingVectors =
        await EmbeddingService.generateEmbeddingsForBatch(queryVariants);

      let detectedTypes = null;
      if (queryDomain === 'type_matchup') {
        detectedTypes = await QueryExpansionService.detectPokemonTypes(userMessage);
      }

      const parallelSearchResults =
        await VectorSearchService.performParallelVectorSearches(
          embeddingVectors,
          20,
          queryDomain,
          detectedTypes
        );

      const deduplicatedResults =
        ReRankingService.deduplicateAndMergeResults(parallelSearchResults);

      const rerankedResults =
        await ReRankingService.reRankSearchResultsByRelevance(
          userMessage,
          deduplicatedResults,
          5
        );

      const systemPrompt =
        QueryExpansionService.buildSystemPromptForDomain(queryDomain);

      const llmResponse = await LLMService.generateChatResponse(
        userMessage,
        systemPrompt,
        rerankedResults,
        conversationHistory
      );

      return {
        reply: llmResponse,
        references: rerankedResults.map((result) => ({
          title: result.title,
          sourceType: result.sourceType,
          sourceId: result.sourceId,
          relevance: result.relevanceScore || result.similarity,
        })),
        debug: {
          queryDomain,
          variantsGenerated: queryVariants.length,
          totalSearchResults: parallelSearchResults.reduce(
            (sum, batch) => sum + batch.length,
            0
          ),
          afterDedup: deduplicatedResults.length,
          finalResults: rerankedResults.length,
        },
      };
    } catch (error) {
      return {
        reply: `I encountered an error: ${error.message}. Please try again.`,
        references: [],
        debug: { error: error.message },
      };
    }
  }
}

module.exports = new RAGOrchestrator();
