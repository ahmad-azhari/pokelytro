import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Pokemon } from '../../models/pokemon/pokemon';
import { MoveModel } from '../../services/move/move';

type TeamPokemonEntry = {
  pokemonId: number;
  moves: string[];
};

@Component({
  selector: 'app-team-available-moves',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './team-available-moves.html',
  styleUrl: './team-available-moves.css',
})
export class TeamAvailableMoves {
  @Input() pokemons: Pokemon[] = [];
  @Input() allMoves: MoveModel[] = [];
  @Input() teamEntries: TeamPokemonEntry[] = [];

  getAvailableMovesForPokemon(pokemonId: number): MoveModel[] {
    const selectedMoveIds = new Set(this.getSelectedMoveIdsForPokemon(pokemonId));
    return this.allMoves.filter(
      (move) => move.learned_by_ids?.includes(pokemonId) && !selectedMoveIds.has(move._id),
    );
  }

  private getSelectedMoveIdsForPokemon(pokemonId: number): string[] {
    const entry = this.teamEntries.find((teamEntry) => teamEntry.pokemonId === pokemonId);
    return entry?.moves ?? [];
  }
}
