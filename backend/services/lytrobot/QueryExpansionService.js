const Groq = require('groq-sdk');
const Pokemon = require('../../models/Pokemon');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

class QueryExpansionService {
  async extractPokemonNamesFromQuery(userQuery) {
    const systemPrompt = `Extract all Pokemon names mentioned in this query. Return ONLY the pokemon names separated by commas, or "NONE" if no specific pokemon are mentioned. Do not include any other text.`;

    const userPrompt = `Query: "${userQuery}"`;

    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 128,
      });

      const text = response.choices[0]?.message?.content?.trim() || 'NONE';
      if (text === 'NONE') return [];

      const names = text
        .split(',')
        .map((name) => name.trim())
        .filter((name) => {
          if (name.length === 0 || name.length > 50) return false;
          return !/^[^a-zA-Z0-9-()]/i.test(name);
        });

      return names;
    } catch (error) {
      return [];
    }
  }

  async fetchPokemonTypesByNames(pokemonNames) {
    if (!pokemonNames || pokemonNames.length === 0) return [];

    try {
      const regexQueries = pokemonNames.flatMap((name) => [
        { name: { $regex: `^${name}$`, $options: 'i' } },
        { name: { $regex: `^${name}\\s*\\(`, $options: 'i' } },
      ]);

      const pokemon = await Pokemon.find(
        { $or: regexQueries },
        { name: 1, type1: 1, type2: 1 }
      ).lean();

      const types = new Set();
      pokemon.forEach((p) => {
        if (p.type1) types.add(p.type1.toUpperCase());
        if (p.type2) types.add(p.type2.toUpperCase());
      });

      const typesArray = Array.from(types);
      return typesArray;
    } catch (error) {
      return [];
    }
  }

  async generateQueryVariants(userQuery, queryDomain = null) {
    let variants = [userQuery];

    if (queryDomain === 'type_matchup') {
      const pokemonNames = await this.extractPokemonNamesFromQuery(userQuery);
      const types = await this.fetchPokemonTypesByNames(pokemonNames);

      if (types.length > 0) {
        types.forEach((type) => {
          variants.push(`${type} type matchup effectiveness`);
          variants.push(`${type} type weakness and strength`);
        });
        return variants.slice(0, 3);
      }
    }

    if (['stats', 'strategy', 'evolution'].includes(queryDomain)) {
      const pokemonNames = await this.extractPokemonNamesFromQuery(userQuery);
      if (pokemonNames.length > 0) {
        pokemonNames.forEach((name) => {
          if (queryDomain === 'stats') {
            variants.push(`${name} base stats defensive stats`);
            variants.push(`${name} defense stat comparison`);
          } else if (queryDomain === 'strategy') {
            variants.push(`${name} competitive strategy moveset`);
            variants.push(`${name} team synergy role`);
          } else if (queryDomain === 'evolution') {
            variants.push(`${name} evolution methods form`);
            variants.push(`${name} evolutionary line`);
          }
        });
        return variants.slice(0, 3);
      }
    }

    const systemPrompt = `You are a query expansion expert. Given a user query about Pokemon, generate exactly 2 semantic variations that would help find relevant information. Each variation should be a complete query sentence, not just keywords. Return ONLY the two variations, one per line, without numbering or prefixes.`;

    const userPrompt = `Original query: "${userQuery}"\n\nGenerate 2 semantic variations of this query that capture different angles or phrasings. Each variation should be on a new line.`;

    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 256,
      });

      const responseText = response.choices[0]?.message?.content || '';
      const generatedVariants = responseText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 2);

      return [userQuery, ...generatedVariants];
    } catch (error) {
      return [userQuery];
    }
  }

  async detectQueryDomain(userQuery) {
    const systemPrompt = `Classify the Pokemon query into one of these domains: "stats", "strategy", "type_matchup", "evolution", "location", or "general". Return ONLY the domain name, nothing else.`;

    const userPrompt = `Query: "${userQuery}"`;

    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 32,
      });

      const domain = response.choices[0]?.message?.content?.trim().toLowerCase() || 'general';
      return domain;
    } catch (error) {
      return 'general';
    }
  }

  async detectPokemonTypes(userQuery) {
    const pokemonNames = await this.extractPokemonNamesFromQuery(userQuery);
    return await this.fetchPokemonTypesByNames(pokemonNames);
  }

  buildSystemPromptForDomain(domain) {
    const antiHallucinationWarning = `IMPORTANT: Only use information explicitly provided in the retrieved knowledge. Do not make up, assume, or infer facts not stated in the context. If data is missing, say so clearly.`;

    const domainPrompts = {
      stats: `You are a Pokemon stats expert. Provide detailed information about Pokemon base stats, total stats, stat distribution, competitive viability based on stats, and stat-based strategy recommendations. Be specific with numbers and comparisons. ${antiHallucinationWarning}`,

      strategy: `You are an experienced Pokemon trainer and strategist. Provide competitive team building advice, move recommendations, ability analysis, held item suggestions, EV/IV training guidance, and synergy recommendations between Pokemon. ${antiHallucinationWarning}`,

      type_matchup: `You are a Pokemon type expert. Provide comprehensive information about type advantages, disadvantages, defensive and offensive coverage, type-based strategy, and explain type matchup effectiveness clearly with examples. Type effectiveness is based on game mechanics - only state what is explicitly confirmed in the retrieved data. ${antiHallucinationWarning}`,

      evolution: `You are a Pokemon evolution expert. Provide detailed information about evolution methods, evolutionary lines, stat changes upon evolution, move learning through evolution, and strategic evolution choices. ${antiHallucinationWarning}`,

      location: `You are a Pokemon location expert. Provide information about where to find Pokemon in various games, habitat preferences, encounter rates, and availability across different game versions. ${antiHallucinationWarning}`,

      general: `You are LytroBot, the official Pokemon assistant for Pokelytro. You help users with all Pokemon-related questions using retrieved knowledge. When information is uncertain or missing, say so clearly. Keep responses concise and accurate. ${antiHallucinationWarning}`,
    };

    return domainPrompts[domain] || domainPrompts.general;
  }
}

module.exports = new QueryExpansionService();
