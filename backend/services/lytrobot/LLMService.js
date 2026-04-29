const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

class LLMService {
  async generateChatResponse(
    userMessage,
    systemPrompt,
    retrievedContext,
    conversationHistory
  ) {
    const formattedContext = this.formatContextForLLM(retrievedContext);

    const antiHallucinationConstraint = `\n\n  CONSTRAINT: You MUST base your response ONLY on the retrieved knowledge provided above. Do not make up, infer, or assume information not explicitly stated in the retrieved context. If the context doesn't contain relevant information, say "I don't have specific information about that in my knowledge base."`;

    const messages = [
      { role: 'system', content: systemPrompt + antiHallucinationConstraint },
      {
        role: 'system',
        content: `Retrieved Knowledge:\n${formattedContext}`,
      },
      ...conversationHistory.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages,
        temperature: 0.6,
        max_tokens: 1024,
        top_p: 0.9,
      });

      const responseText =
        response.choices[0]?.message?.content ||
        'I could not process that request.';

      return responseText;
    } catch (error) {
      if (error.status === 429) {
        throw new Error(
          'The AI service is receiving many requests. Please try again in a moment.'
        );
      }

      throw new Error('Failed to generate response from LLM');
    }
  }

  formatContextForLLM(retrievedChunks) {
    if (!Array.isArray(retrievedChunks) || retrievedChunks.length === 0) {
      return 'No retrieved context available.';
    }

    return retrievedChunks
      .map((chunk, index) => {
        const sourceInfo = `[${index + 1}] ${chunk.title} (${chunk.sourceType})`;
        const contentInfo = chunk.metadata
          ? this.formatMetadataForContext(chunk.metadata)
          : chunk.text || '';

        return `${sourceInfo}\n${contentInfo}`;
      })
      .join('\n\n');
  }

  formatMetadataForContext(metadata) {
    if (metadata.stats) {
      const stats = metadata.stats;
      return `${metadata.name} - Type: ${metadata.type1}${metadata.type2 ? `/${metadata.type2}` : ''} - Stats: HP ${stats.hp}, ATK ${stats.attack}, DEF ${stats.defense}, SP.A ${stats.special_attack}, SP.D ${stats.special_defense}, SPD ${stats.speed} (Total: ${stats.total})`;
    }

    if (metadata.attackingType && metadata.defenderType) {
      const effectiveness =
        metadata.effectiveness === 'super_effective'
          ? '✓ Super Effective'
          : metadata.effectiveness === 'not_very_effective'
          ? '✗ Not Very Effective'
          : '• Neutral';
      return `${metadata.attackingType} attacking ${metadata.defenderType}: ${effectiveness} (${metadata.multiplier}x)`;
    }

    return JSON.stringify(metadata);
  }

  async validateResponseQuality(userMessage, llmResponse) {
    const validationPrompt = `Does this response appropriately answer the Pokemon question? Question: "${userMessage}" Response: "${llmResponse}" Answer with just "yes" or "no".`;

    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: validationPrompt }],
        temperature: 0.1,
        max_tokens: 16,
      });

      const validationResult =
        response.choices[0]?.message?.content?.toLowerCase() || 'yes';
      return validationResult.includes('yes');
    } catch (error) {
      return true;
    }
  }
}

module.exports = new LLMService();
