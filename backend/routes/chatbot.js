const express = require("express");
const router = express.Router();
const Groq = require("groq-sdk");
const math = require("mathjs");
const Pokemon = require("../models/Pokemon");
const Type = require("../models/Type");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_INSTRUCTION = `You are PokéBot, the AI assistant for Pokelytro — a Pokémon web app.
You have access to a comprehensive database of all Pokémon with their stats, types, abilities, evolution methods, and more.
When data from the database is provided as context, use it to give accurate, specific answers.
If no database results match, use your general Pokémon knowledge.
Keep answers concise and helpful. Use Pokémon terminology naturally.
You can compare Pokémon, suggest teams, explain type matchups, and discuss strategies.
Format important stats or names in bold when helpful.
If you don't know something, say so honestly.`;

let extractor = null;
let pokemonVectorStore = [];
let isVectorStoreReady = false;


async function initVectorStore() {
  try {
    console.log("[Chatbot] Downloading/Loading local embedding model...");
    const { pipeline } = await import("@xenova/transformers");
    extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    
    console.log("[Chatbot] Fetching Pokémon for vector generation...");
    const allPokemons = await Pokemon.find({}).lean();
    
    console.log(`[Chatbot] Generating semantic embeddings for ${allPokemons.length} Pokémon...`);
    
    for (let i = 0; i < allPokemons.length; i++) {
        const p = allPokemons[i];
        const textToEmbed = `${p.name}. Type: ${p.type1}${p.type2 ? " and " + p.type2 : ""}. ` +
                            `Abilities: ${p.ability1}${p.ability2 ? ", " + p.ability2 : ""}. ` +
                            `It has ${p.hp} HP, ${p.attack} Attack, ${p.defense} Defense, ` +
                            `${p.special_attack} Special Attack, ${p.special_defense} Special Defense, ` +
                            `and ${p.speed} Speed. Total base stats: ${p.total}. ` +
                            `Generation ${p.generation}. Height: ${p.height}m, Weight: ${p.weight}kg. ` +
                            `${p.evolution_method ? "Evolves by " + p.evolution_method + "." : ""}`;
        
        const output = await extractor(textToEmbed, { pooling: "mean", normalize: true });
        pokemonVectorStore.push({
            pokemon: p,
            vector: Array.from(output.data)
        });
        
        if (i > 0 && i % 250 === 0) {
            console.log(`[Chatbot] Embeddings progress: ${i}/${allPokemons.length}`);
        }
    }
    
    isVectorStoreReady = true;
    console.log("[Chatbot] Local vector store ready! Semantic search enabled.");
  } catch (error) {
    console.error("[Chatbot] Failed to initialize vector store:", error);
  }
}

async function searchPokemonByName(query) {
  const words = query.toLowerCase().split(/\s+/);
  const results = [];

  for (const word of words) {
    if (word.length < 3) continue;
    const regex = new RegExp(word, "i");
    const found = await Pokemon.find({ name: regex }).limit(5).lean();
    results.push(...found);
  }

  const uniqueMap = new Map();
  for (const p of results) {
    uniqueMap.set(String(p._id), p);
  }
  return Array.from(uniqueMap.values()).slice(0, 5);
}

async function searchPokemonByVector(query) {
  if (!isVectorStoreReady || !extractor) {
     console.log("[Chatbot] Vector store not ready, falling back to basic text search...");
     return searchPokemonByName(query);
  }

  const output = await extractor(query, { pooling: "mean", normalize: true });
  const queryVector = Array.from(output.data);

  const results = pokemonVectorStore.map(item => ({
     pokemon: item.pokemon,
     score: math.dot(queryVector, item.vector)
  }));

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5).map(r => r.pokemon);
}

async function searchByType(query) {
  const typeNames = [
    "Normal", "Fire", "Water", "Electric", "Grass", "Ice",
    "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug",
    "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
  ];

  const lowerQuery = query.toLowerCase();
  const matchedTypes = typeNames.filter((t) => lowerQuery.includes(t.toLowerCase()));

  if (matchedTypes.length === 0) return { pokemons: [], typeChart: [] };

  const typeLower = matchedTypes[0].toLowerCase();
  const pokemons = await Pokemon.find({ type1: { $regex: new RegExp(`^${typeLower}$`, "i") } })
    .limit(10)
    .lean();

  const typeChart = await Type.find({
    $or: [
      { attacking_type: { $regex: new RegExp(`^${typeLower}$`, "i") } },
      { defender_type: { $regex: new RegExp(`^${typeLower}$`, "i") } },
    ],
  }).lean();

  return { pokemons, typeChart };
}

function formatPokemonContext(pokemons) {
  if (!pokemons.length) return "";
  return pokemons
    .map(
      (p) =>
        `[#${p._id} ${p.name}] Type: ${p.type1}${p.type2 ? "/" + p.type2 : ""} | ` +
        `HP:${p.hp} Atk:${p.attack} Def:${p.defense} SpA:${p.special_attack} SpD:${p.special_defense} Spe:${p.speed} (Total:${p.total}) | ` +
        `Abilities: ${p.ability1}${p.ability2 ? ", " + p.ability2 : ""}${p.hidden_ability ? " (HA: " + p.hidden_ability + ")" : ""} | ` +
        `Height:${p.height}m Weight:${p.weight}kg | Gen:${p.generation}` +
        `${p.evolution_method ? " | Evo: " + p.evolution_method : ""}`
    )
    .join("\n");
}

function formatTypeContext(typeChart) {
  if (!typeChart.length) return "";
  return typeChart
    .map((t) => `${t.attacking_type} → ${t.defender_type}: x${t.multiplier}`)
    .join("\n");
}

function convertHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((msg) => msg.role === "user" || msg.role === "model")
    .map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));
}

// POST /api/chatbot/message
router.post("/message", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "A message is required." });
    }

    const [pokemonResults, typeResults] = await Promise.all([
      searchPokemonByVector(message),
      searchByType(message),
    ]);

    let contextParts = [];
    const allPokemons = [
      ...pokemonResults,
      ...typeResults.pokemons.filter(
        (tp) => !pokemonResults.some((p) => String(p._id) === String(tp._id))
      ),
    ];

    if (allPokemons.length > 0) {
      contextParts.push(
        "DATABASE RESULTS — Pokémon found:\n" + formatPokemonContext(allPokemons)
      );
    }

    if (typeResults.typeChart.length > 0) {
      contextParts.push(
        "TYPE MATCHUP DATA:\n" + formatTypeContext(typeResults.typeChart)
      );
    }

    let userContent = message;
    if (contextParts.length > 0) {
      userContent =
        "--- Retrieved from Pokelytro Database ---\n" +
        contextParts.join("\n\n") +
        "\n--- End Database Context ---\n\n" +
        "User question: " +
        message;
    }

    const totalPokemons = await Pokemon.countDocuments();
    
    const DYNAMIC_SYSTEM_INSTRUCTION = `${SYSTEM_INSTRUCTION}
    
CRITICAL KNOWLEDGE UPDATE: 
- The Pokelytro database currently contains exactly ${totalPokemons} Pokémon (up to Generation 9 / Paldea / Kitakami / Blueberry).
- If asked "how many Pokémon are there", answer with ${totalPokemons}. 
- Do NOT say there are 898 Pokémon. Rely on the provided database context and stats.`;

    const groqHistory = convertHistory(history || []);
    
    const messages = [
      { role: "system", content: DYNAMIC_SYSTEM_INSTRUCTION },
      ...groqHistory,
      { role: "user", content: userContent }
    ];

    const chatCompletion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "I couldn't process that request.";

    res.status(200).json({ reply });
  } catch (err) {
    console.error("Chatbot error:", err);

    if (err.status === 429) {
      return res.status(429).json({
        message: "I'm getting a lot of questions right now! Please wait a moment and try again.",
      });
    }

    res
      .status(500)
      .json({ message: "Error processing your message. Please try again." });
  }
});


router.initVectorStore = initVectorStore;
module.exports = router;
