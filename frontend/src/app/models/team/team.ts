import { PokeMoves } from '../poke_moves/poke_moves';

export type TeamPokemonSlot = {
  pokemonId: number;
  moves: string[];
};

// Backend soporta dos formatos para `pokemons`:
// - number (pokemonId)
// - { pokemonId, moves: ObjectId[] }
export type TeamPokemon = number | TeamPokemonSlot;

/**
 * Normaliza `team.pokemons` a un formato uniforme: { pokemonId, moves: string[] }.
 * Así evitamos repetir comprobaciones `typeof === 'number'` en varias páginas.
 */
export function normalizeTeamPokemons(pokemons: TeamPokemon[] | null | undefined): TeamPokemonSlot[] {
  if (!Array.isArray(pokemons)) return [];

  return pokemons
    .map((entry) => {
      if (typeof entry === 'number') {
        return { pokemonId: entry, moves: [] } as TeamPokemonSlot;
      }

      if (entry && typeof entry === 'object') {
        const pokemonId = Number((entry as TeamPokemonSlot).pokemonId);
        if (!Number.isFinite(pokemonId)) return null;

        const rawMoves = (entry as TeamPokemonSlot).moves;
        const moves = Array.isArray(rawMoves)
          ? rawMoves.map((m) => String(m)).slice(0, 4)
          : [];

        return { pokemonId, moves } as TeamPokemonSlot;
      }

      return null;
    })
    .filter((x): x is TeamPokemonSlot => !!x); // !!x elimina null, undefined y false
}

export class Team {
  _id?: string;
  name!: string;
  pokemons!: TeamPokemon[];
  moves?: PokeMoves[]; // Array of PokeMoves objects
  userId!: string; // ID of the user who owns the team

  constructor(init?: Partial<Team>) {
    if (init) Object.assign(this, init);
  }
}
