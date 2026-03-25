import { PokeMoves } from '../poke_moves/poke_moves';

export class Team {
  _id?: string;
  name!: string;
  pokemons!: number[]; // Array of Pokemon IDs
  moves?: PokeMoves[]; // Array of PokeMoves objects
  userId!: string; // ID of the user who owns the team

  constructor(init?: Partial<Team>) {
    if (init) Object.assign(this, init);
  }
}
