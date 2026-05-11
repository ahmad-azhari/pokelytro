require('dotenv').config();
const mongoose = require('mongoose');
const Pokemon = require('../models/Pokemon');

async function connectToDatabase() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pokelytro';
  if (mongoose.connection.readyState !== 0) return;
  await mongoose.connect(mongoUri);
}

async function searchPokemon(searchName) {
  console.log(`\n Searching for: "${searchName}"`);

  const regex = { $regex: `^${searchName}$`, $options: 'i' };
  const result = await Pokemon.findOne({ name: regex }, { name: 1, type1: 1, type2: 1, _id: 1 }).lean();

  if (result) {
    console.log(` Found: ${result.name} (ID: ${result._id}) - Type: ${result.type1}${result.type2 ? `/${result.type2}` : ''}`);
  } else {
    console.log(` Not found with exact match. Trying partial...`);
    const partial = await Pokemon.find({ name: { $regex: searchName, $options: 'i' } }, { name: 1 }).lean().limit(5);
    if (partial.length > 0) {
      console.log(`   Similar names found:`);
      partial.forEach(p => console.log(`   - ${p.name}`));
    } else {
      console.log(`   No similar names found`);
    }
  }
}

async function main() {
  try {
    await connectToDatabase();

    await searchPokemon('Rotom-Wash');
    await searchPokemon('Rotom');
    await searchPokemon('Gastrodon');

    console.log('\n Diagnosis complete');
  } finally {
    await mongoose.disconnect();
  }
}

main();
