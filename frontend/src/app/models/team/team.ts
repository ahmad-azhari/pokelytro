import { TeamPokemon } from '../teamPokemon/teamPokemon';

export class Team {
  _id?: string;
  name!: string;
  pokemons!: TeamPokemon[]; // Array of TeamPokemon objects
  userId!: string; // ID of the user who owns the team

  constructor(init?: Partial<Team>) {
    if (init) Object.assign(this, init);
  }
}
