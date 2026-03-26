import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Pokemon } from '../../models/pokemon/pokemon';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterLink } from '@angular/router';

import { Team as TeamService } from '../../services/team/team';
import { Pokemon as PokemonService } from '../../services/pokemon/pokemon';
import { Move as MoveService, MoveModel } from '../../services/move/move';

import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TeamDetailDialog } from '../team-detail-dialog/team-detail-dialog';

type TeamPokemonEntry = {
  pokemonId: number;
  moves: string[];
};

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatDialogModule, MatButtonModule],
  templateUrl: './team-detail.html',
  styleUrls: ['./team-detail.css'],
})
export class TeamDetail implements OnInit {
  private teamService = inject(TeamService);
  private pokemonService = inject(PokemonService);
  private moveService = inject(MoveService);
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  team: any | null = null;
  teamPokemons: Pokemon[] = [];
  allPokemons: Pokemon[] = [];
  allMoves: MoveModel[] = [];
  teamEntries: TeamPokemonEntry[] = [];
  selectedPokemonToReplace: Pokemon | null = null;
  errorMessage: string | null = null;
  isEditingName: boolean = false;
  newTeamName: string = '';
  moveSlots = [0, 1, 2, 3];
  activeMovePickerPokemonId: number | null = null;
  replacingMoveId: string | null = null;
  availableMovesForSelectedPokemon: MoveModel[] = [];
  editingMoveSlot: { pokemonId: number; slotIndex: number } | null = null;
  isLoading = true;

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const teamId = params['teamId'] as string;

      if (!teamId) {
        alert('No teamId provided');
        this.router.navigate(['/team-builder']);
        return;
      }

      // Cargar team y movimientos en paralelo
      this.teamService.getById(teamId).subscribe({
        next: (team: any) => {
          this.team = team;

          if (!this.team) {
            alert('Team not found');
            this.router.navigate(['/team-builder']);
            return;
          }

          // Extraer IDs únicos del equipo
          const pokemonIds = this.team.pokemons
            .map((entry: any) => (typeof entry === 'number' ? entry : entry.pokemonId))
            .filter((id: number) => Number.isFinite(id));

          // Cargar solo los Pokémon del equipo
          if (pokemonIds.length > 0) {
            this.pokemonService.getByIds(pokemonIds).subscribe({
              next: (pokemons) => {
                this.allPokemons = pokemons;
                this.syncTeamPokemons();
              },
            });
          }

          // Cargar movimientos
          this.moveService.get().subscribe({
            next: (moves) => {
              this.allMoves = moves;
              this.isLoading = false;
            },
          });
        },
      });
    });
  }

  // Actualizar el Pokémon seleccionado para reemplazo y abrir el diálogo
  onUpdatePokemon(pokemon: Pokemon) {
    this.selectedPokemonToReplace = pokemon;
    const dialogRef = this.dialog.open(TeamDetailDialog, {
      data: { selectedPokemon: pokemon },
      width: '980px',
      maxWidth: '96vw',
      panelClass: 'team-detail-dialog-panel',
    });

    dialogRef.afterClosed().subscribe((result: Pokemon | null) => {
      if (result) {
        this.onReplacePokemon(result);
      } else {
        this.selectedPokemonToReplace = null;
      }
    });
  }

  onReplacePokemon(newPokemon: Pokemon) {
    if (!this.team || !this.selectedPokemonToReplace) return;

    const oldId = this.selectedPokemonToReplace.id;
    const entries = this.teamEntries;
    const idx = entries.findIndex((entry) => entry.pokemonId === oldId);
    if (idx === -1) return;

    const previousEntries = [...entries];
    const updatedEntries = [...entries];
    updatedEntries[idx] = {
      pokemonId: newPokemon.id,
      moves: [],
    };

    this.teamService
      .put(this.team._id!, { ...this.team, pokemons: updatedEntries } as any)
      .subscribe({
        next: (response: any) => {
          this.team = response;

          const hadNewPokemon = this.allPokemons.some((pokemon) => pokemon.id === newPokemon.id);
          if (!hadNewPokemon) {
            this.allPokemons = this.allPokemons
              .filter((pokemon) => pokemon.id !== oldId)
              .concat(newPokemon);
          }

          this.syncTeamPokemons();
          this.selectedPokemonToReplace = null;
          this.closeMovePicker();
          this.errorMessage = null;
          this.mostrarNotificacion('Pokemon replaced successfully!');
        },
        error: (err) => {
          this.errorMessage = err?.error?.message || 'Could not update the team';
          this.team!.pokemons = previousEntries;
          this.selectedPokemonToReplace = null;
        },
      });
  }

  // Editar el nombre del equipo
  onEditName() {
    this.isEditingName = true;
    this.newTeamName = this.team?.name || '';
  }

  onSaveName() {
    if (!this.team || !this.newTeamName.trim()) {
      this.errorMessage = 'Team name cannot be empty';
      return;
    }

    this.teamService
      .put(this.team._id!, { ...this.team, name: this.newTeamName } as any)
      .subscribe({
        next: (response: any) => {
          this.team = response;
          this.cancelEditName();
          this.errorMessage = null;
          this.mostrarNotificacion('Team name updated successfully!');
        },
        error: (err) => {
          this.errorMessage = err?.error?.message || 'Could not update the team name';
        },
      });
  }

  cancelEditName() {
    this.isEditingName = false;
    this.newTeamName = '';
  }

  // Obtener el ID del movimiento asignado a un slot específico de un Pokémon
  getMoveIdForSlot(pokemonId: number, slotIndex: number): string | null {
    const entry = this.teamEntries.find((item) => item.pokemonId === pokemonId);
    return entry?.moves[slotIndex] || null;
  }
  // Obtener el nombre del movimiento para mostrar en la interfaz
  getMoveNameForSlot(pokemonId: number, slotIndex: number): string {
    const moveId = this.getMoveIdForSlot(pokemonId, slotIndex);
    if (!moveId) return '+';
    const moveName = this.allMoves.find((m) => m._id === moveId)?.name || 'Unknown move';
    return this.formatMoveName(moveName);
  }
  // Abrir el selector de movimientos para un Pokémon específico, considerando si se está reemplazando un movimiento existente o agregando uno nuevo
  onOpenMovePicker(pokemon: Pokemon) {
    if (!this.team?._id) return;

    const entry = this.teamEntries.find((item) => item.pokemonId === pokemon.id);
    if (!entry) return;

    const isReplacing = !!this.replacingMoveId;

    if (!isReplacing && entry.moves.length >= 4) {
      this.mostrarNotificacion('This Pokemon already has 4 moves');
      return;
    }

    const usedMoveIds = new Set(entry.moves.filter((id) => id !== this.replacingMoveId));
    const compatibleMoves = this.allMoves.filter(
      (move) => move.learned_by_ids?.includes(pokemon.id) && !usedMoveIds.has(move._id),
    );

    if (compatibleMoves.length === 0) {
      this.mostrarNotificacion('No available moves for this Pokemon');
      return;
    }

    this.activeMovePickerPokemonId = pokemon.id;
    this.availableMovesForSelectedPokemon = compatibleMoves;
  }

  // Manejar la adición o reemplazo de un movimiento para un Pokémon específico, actualizando el equipo en consecuencia y mostrando notificaciones de éxito o error
  onAddMoveToPokemon(moveId: string) {
    if (!this.team?._id || !this.activeMovePickerPokemonId || !moveId) return;

    if (this.replacingMoveId) {
      this.teamService
        .replaceMove(this.team._id, this.activeMovePickerPokemonId, this.replacingMoveId, moveId)
        .subscribe({
          next: (response: any) => {
            this.team = response;
            this.syncTeamPokemons();
            this.closeMovePicker();
            this.errorMessage = null;
            this.mostrarNotificacion('Move replaced successfully!');
          },
          error: (err) => {
            this.errorMessage = err?.error?.message || 'Could not replace move';
          },
        });
      return;
    }

    this.teamService.addMove(this.team._id, this.activeMovePickerPokemonId, moveId).subscribe({
      next: (response: any) => {
        this.team = response;
        this.syncTeamPokemons();
        this.closeMovePicker();
        this.errorMessage = null;
        this.mostrarNotificacion('Move added successfully!');
      },
      error: (err) => {
        this.errorMessage = err?.error?.message || 'Could not add move';
      },
    });
  }
  // Cerrar el selector de movimientos y limpiar los estados relacionados
  closeMovePicker() {
    this.activeMovePickerPokemonId = null;
    this.replacingMoveId = null;
    this.availableMovesForSelectedPokemon = [];
    this.editingMoveSlot = null;
  }
  // Manejar la apertura del editor de movimientos para un slot específico de un Pokémon, estableciendo el estado necesario para identificar qué movimiento se está editando
  onOpenMoveEditor(pokemon: Pokemon, slotIndex: number) {
    const moveId = this.getMoveIdForSlot(pokemon.id, slotIndex);
    if (!moveId) return;

    this.editingMoveSlot = { pokemonId: pokemon.id, slotIndex };
  }

  // Manejar la eliminación de un movimiento específico de un slot de un Pokémon, actualizando el equipo en consecuencia y mostrando notificaciones de éxito o error
  onDeleteMove() {
    if (!this.editingMoveSlot || !this.team?._id) return;

    const moveId = this.getMoveIdForSlot(
      this.editingMoveSlot.pokemonId,
      this.editingMoveSlot.slotIndex,
    );
    if (!moveId) return;

    this.teamService.removeMove(this.team._id, this.editingMoveSlot.pokemonId, moveId).subscribe({
      next: (response: any) => {
        this.team = response;
        this.syncTeamPokemons();
        this.editingMoveSlot = null;
        this.errorMessage = null;
        this.mostrarNotificacion('Move deleted successfully!');
      },
      error: (err) => {
        this.errorMessage = err?.error?.message || 'Could not delete move';
      },
    });
  }
  // Manejar la apertura del selector de movimientos para reemplazar un movimiento específico de un slot de un Pokémon, estableciendo el estado necesario para identificar qué movimiento se está reemplazando
  onReplaceMove() {
    if (!this.editingMoveSlot) return;
    const moveId = this.getMoveIdForSlot(
      this.editingMoveSlot.pokemonId,
      this.editingMoveSlot.slotIndex,
    );
    if (!moveId) return;

    this.replacingMoveId = moveId;
    this.activeMovePickerPokemonId = this.editingMoveSlot.pokemonId;
    this.onOpenMovePicker(this.teamPokemons.find((p) => p.id === this.editingMoveSlot?.pokemonId)!);
  }

  // Obtener el nombre del Pokémon actualmente seleccionado para el selector de movimientos, para mostrarlo en la interfaz del selector
  getActiveMovePickerPokemonName(): string {
    if (!this.activeMovePickerPokemonId) return '';
    return (
      this.teamPokemons.find((pokemon) => pokemon.id === this.activeMovePickerPokemonId)?.name ||
      `#${this.activeMovePickerPokemonId}`
    );
  }

  // Construir la lista de entradas de Pokémon del equipo a partir de los datos crudos del equipo, asegurándose de manejar diferentes formatos de entrada y filtrando entradas inválidas
  private buildTeamPokemonEntries(): TeamPokemonEntry[] {
    const rawPokemons = this.team?.pokemons;
    if (!Array.isArray(rawPokemons)) return [];

    return rawPokemons
      .map((entry: any) => {
        if (typeof entry === 'number') {
          return { pokemonId: entry, moves: [] };
        }

        if (entry && typeof entry === 'object') {
          const pokemonId = Number(entry.pokemonId);
          if (!Number.isFinite(pokemonId)) return null;

          const moves = Array.isArray(entry.moves)
            ? entry.moves.map((move: any) => String(move)).slice(0, 4)
            : [];

          return { pokemonId, moves };
        }

        return null;
      })
      .filter((entry: TeamPokemonEntry | null): entry is TeamPokemonEntry => !!entry);
  }

  // Obtener el movimiento actualmente seleccionado para edición, basado en el estado de qué slot de movimiento se está editando, para mostrarlo en la interfaz del editor de movimientos
  getEditingMove(): MoveModel | undefined {
    if (!this.editingMoveSlot) return undefined;

    const moveId = this.getMoveIdForSlot(
      this.editingMoveSlot.pokemonId,
      this.editingMoveSlot.slotIndex,
    );
    return this.allMoves.find((move) => move._id === moveId);
  }

  // Obtener el nombre del Pokémon actualmente seleccionado para edición, basado en el estado de qué slot de movimiento se está editando, para mostrarlo en la interfaz del editor de movimientos
  getEditingPokemonName(): string {
    if (!this.editingMoveSlot) return '';
    return (
      this.teamPokemons.find((p) => p.id === this.editingMoveSlot?.pokemonId)?.name ||
      `#${this.editingMoveSlot.pokemonId}`
    );
  }

  // Formatear el nombre de un movimiento para mostrarlo en la interfaz, reemplazando guiones por espacios y manejando casos de nombres nulos o indefinidos
  formatMoveName(name: string | null | undefined): string {
    if (!name) return '';
    return name.replace(/-/g, ' ');
  }

  // Sincronizar los Pokémon del equipo con los datos disponibles, actualizando las listas necesarias
  private syncTeamPokemons() {
    const map = new Map(this.allPokemons.map((p) => [p.id, p]));
    this.teamEntries = this.buildTeamPokemonEntries();
    this.teamPokemons = this.teamEntries.map((entry) => map.get(entry.pokemonId)!).filter(Boolean);
  }

  mostrarNotificacion(mensaje: string) {
    this.snackBar.open(mensaje, 'Cerrar', {
      duration: 3000,
      verticalPosition: 'top',
    });
  }
}
