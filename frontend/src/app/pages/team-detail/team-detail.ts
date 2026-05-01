import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Pokemon } from '../../models/pokemon/pokemon';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { PaginationControls } from '../../components/pagination-controls/pagination-controls';
import { FilterPanel } from '../../components/filter-panel/filter-panel';

import { Team as TeamService } from '../../services/team/team';
import { Pokemon as PokemonService } from '../../services/pokemon/pokemon';
import { MoveService, MoveModel } from '../../services/move/move';
import { Team as TeamModel, TeamPokemonSlot } from '../../models/team/team';

import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TeamDetailDialog } from '../team-detail-dialog/team-detail-dialog';

type SortOption = 'name' | 'power' | 'accuracy' | 'pp';

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatDialogModule, MatButtonModule, PaginationControls, FilterPanel],
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

  team: TeamModel | null = null;
  teamPokemons: Pokemon[] = [];
  allPokemons: Pokemon[] = [];
  allMoves: MoveModel[] = [];
  teamEntries: TeamPokemonSlot[] = [];
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

  // Variables del filtrado/paginación
  movesSearchTerm = '';
  selectedMoveType = '';
  selectedMoveDamageClass = '';
  moveSortBy: SortOption = 'name';
  moveTypes: string[] = [];
  moveDamageClasses: string[] = [];
  movePage = 1;
  movePageSize = 32;
  moveTotalPages = 1;
  compatibleMovesForSelectedPokemon: MoveModel[] = [];
  filteredAvailableMoves: MoveModel[] = [];
  @ViewChild(FilterPanel) moveFilterPanel?: FilterPanel;

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
        next: (team) => {
          this.team = team;

          if (!this.team) {
            alert('Team not found');
            this.router.navigate(['/team-builder']);
            return;
          }

          // Extraer IDs únicos del equipo
          const pokemonIds = (this.team.pokemons ?? [])
            .map((entry) => entry.pokemonId)
            .filter((id) => Number.isFinite(id));

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
              this.extractMoveFilterValues();
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
      .put(this.team._id!, { ...this.team, pokemons: updatedEntries })
      .subscribe({
        next: (response) => {
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
      .put(this.team._id!, { ...this.team, name: this.newTeamName })
      .subscribe({
        next: (response) => {
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

  // Manejo de movimientos
  getMoveIdForSlot(pokemonId: number, slotIndex: number): string | null {
    const entry = this.teamEntries.find((item) => item.pokemonId === pokemonId);
    return entry?.moves[slotIndex] || null;
  }

  getMoveNameForSlot(pokemonId: number, slotIndex: number): string {
    const moveId = this.getMoveIdForSlot(pokemonId, slotIndex);
    if (!moveId) return '+';
    const moveName = this.allMoves.find((m) => m._id === moveId)?.name || 'Unknown move';
    return this.formatMoveName(moveName);
  }

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
    // Resetear filtros y búsqueda
    this.movesSearchTerm = '';
    this.selectedMoveType = '';
    this.selectedMoveDamageClass = '';
    this.moveSortBy = 'name';
    this.movePage = 1;
    this.compatibleMovesForSelectedPokemon = compatibleMoves;
    this.filteredAvailableMoves = compatibleMoves;
    this.extractMoveFilterValues();
    this.applyMoveFilters();
    this.availableMovesForSelectedPokemon = this.pagedAvailableMoves;
  }

  onAddMoveToPokemon(moveId: string) {
    if (!this.team?._id || !this.activeMovePickerPokemonId || !moveId) return;

    if (this.replacingMoveId) {
      this.teamService
        .replaceMove(this.team._id, this.activeMovePickerPokemonId, this.replacingMoveId, moveId)
        .subscribe({
            next: (response) => {
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
      next: (response) => {
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

  closeMovePicker() {
    this.activeMovePickerPokemonId = null;
    this.replacingMoveId = null;
    this.availableMovesForSelectedPokemon = [];
    this.compatibleMovesForSelectedPokemon = [];
    this.filteredAvailableMoves = [];
    this.editingMoveSlot = null;
  }

  onOpenMoveEditor(pokemon: Pokemon, slotIndex: number) {
    const moveId = this.getMoveIdForSlot(pokemon.id, slotIndex);
    if (!moveId) return;

    this.editingMoveSlot = { pokemonId: pokemon.id, slotIndex };
  }

  onDeleteMove() {
    if (!this.editingMoveSlot || !this.team?._id) return;

    const moveId = this.getMoveIdForSlot(
      this.editingMoveSlot.pokemonId,
      this.editingMoveSlot.slotIndex,
    );
    if (!moveId) return;

    this.teamService.removeMove(this.team._id, this.editingMoveSlot.pokemonId, moveId).subscribe({
      next: (response) => {
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

  getActiveMovePickerPokemonName(): string {
    if (!this.activeMovePickerPokemonId) return '';
    return (
      this.teamPokemons.find((pokemon) => pokemon.id === this.activeMovePickerPokemonId)?.name ||
      '#' + this.activeMovePickerPokemonId
    );
  }

  private buildTeamPokemonEntries(): TeamPokemonSlot[] {
    return (this.team?.pokemons ?? []) as TeamPokemonSlot[];
  }

  getEditingMove(): MoveModel | undefined {
    if (!this.editingMoveSlot) return undefined;

    const moveId = this.getMoveIdForSlot(
      this.editingMoveSlot.pokemonId,
      this.editingMoveSlot.slotIndex,
    );
    return this.allMoves.find((move) => move._id === moveId);
  }

  getEditingPokemonName(): string {
    if (!this.editingMoveSlot) return '';
    return (
      this.teamPokemons.find((p) => p.id === this.editingMoveSlot?.pokemonId)?.name ||
      '#' + this.editingMoveSlot.pokemonId
    );
  }

  formatMoveName(name: string | null | undefined): string {
    if (!name) return '';
    return name.replace(/-/g, ' ');
  }

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

  // Funciones relacionadas con filtrado/paginación de movimientos en el move picker
  private extractMoveFilterValues(): void {
    const typeSet = new Set<string>();
    const damageClassSet = new Set<string>();

    for (const move of this.allMoves) {
      if (move.type) typeSet.add(move.type);
      if (move.damage_class) damageClassSet.add(move.damage_class);
    }

    this.moveTypes = Array.from(typeSet).sort((a, b) => a.localeCompare(b));
    this.moveDamageClasses = Array.from(damageClassSet).sort((a, b) => a.localeCompare(b));
  }

  private applyMoveFilters(): void {
    const q = this.movesSearchTerm.trim().toLowerCase();

    let filtered = this.compatibleMovesForSelectedPokemon.filter((move) => {
      const matchesSearch = !q || move.name.toLowerCase().includes(q);
      const matchesType = !this.selectedMoveType || move.type === this.selectedMoveType;
      const matchesDamageClass = !this.selectedMoveDamageClass || move.damage_class === this.selectedMoveDamageClass;
      return matchesSearch && matchesType && matchesDamageClass;
    });

    if (this.moveSortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.moveSortBy === 'power') {
      filtered.sort((a, b) => (b.power || 0) - (a.power || 0) || a.name.localeCompare(b.name));
    } else if (this.moveSortBy === 'accuracy') {
      filtered.sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0) || a.name.localeCompare(b.name));
    } else if (this.moveSortBy === 'pp') {
      filtered.sort((a, b) => (b.pp || 0) - (a.pp || 0) || a.name.localeCompare(b.name));
    }

    this.filteredAvailableMoves = filtered;
    this.recomputeMoveTotalPages();
    this.availableMovesForSelectedPokemon = this.pagedAvailableMoves;
  }

  private recomputeMoveTotalPages(): void {
    const count = this.filteredAvailableMoves.length;
    this.moveTotalPages = PaginationControls.calculateTotalPages(count, this.movePageSize);
    this.movePage = PaginationControls.normalizePage(this.movePage, this.moveTotalPages);
  }

  get pagedAvailableMoves(): MoveModel[] {
    return PaginationControls.getPagedItems(this.filteredAvailableMoves, this.movePage, this.movePageSize);
  }

  onMoveSearch(term: string): void {
    this.movesSearchTerm = term;
    this.movePage = 1;
    this.applyMoveFilters();
  }

  onMoveTypeChange(type: string): void {
    this.selectedMoveType = type;
    this.movePage = 1;
    this.applyMoveFilters();
  }

  onMoveDamageClassChange(damageClass: string): void {
    this.selectedMoveDamageClass = damageClass;
    this.movePage = 1;
    this.applyMoveFilters();
  }

  onMoveSortChange(sort: SortOption): void {
    this.moveSortBy = sort;
    this.movePage = 1;
    this.applyMoveFilters();
  }

  clearMoveFilters(): void {
    this.selectedMoveType = '';
    this.selectedMoveDamageClass = '';
    this.moveSortBy = 'name';
    this.movesSearchTerm = '';
    this.movePage = 1;
    this.applyMoveFilters();
    this.moveFilterPanel?.closeFilters();
  }

  nextMovePage(): void {
    const nextPage = PaginationControls.getNextPage(this.movePage, this.moveTotalPages);
    if (nextPage !== undefined) {
      this.movePage = nextPage;
      this.availableMovesForSelectedPokemon = this.pagedAvailableMoves;
    }
  }

  prevMovePage(): void {
    const prevPage = PaginationControls.getPrevPage(this.movePage);
    if (prevPage !== undefined) {
      this.movePage = prevPage;
      this.availableMovesForSelectedPokemon = this.pagedAvailableMoves;
    }
  }

  goToMovePage(target: number): void {
    if (!Number.isFinite(target)) return;
    this.movePage = PaginationControls.normalizePage(target, this.moveTotalPages);
    this.availableMovesForSelectedPokemon = this.pagedAvailableMoves;
  }
}
