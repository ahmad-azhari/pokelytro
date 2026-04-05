import { Move } from '../move/move';

export class TeamPokemon {
  pokemonId: number;
  moves: Move[];

  constructor(pokemonId: number, moves: Move[]) {
    this.pokemonId = pokemonId;
    this.moves = moves;
  }
}
