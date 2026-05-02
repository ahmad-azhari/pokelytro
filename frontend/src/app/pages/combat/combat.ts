import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

import { AuthService } from '../../services/auth.service';
import { Team as TeamService } from '../../services/team/team';
import { Pokemon as PokemonService } from '../../services/pokemon/pokemon';
import { MoveService, MoveModel } from '../../services/move/move';
import { Type as TypeService, TypeModel as TypeEffectivenessRow } from '../../services/type/type';

import { Pokemon as PokemonModel } from '../../models/pokemon/pokemon';
import {
  Team as TeamModel,
  TeamPokemonSlot,
} from '../../models/team/team';

import { PokemonPickerDialog } from '../../components/pokemon-picker-dialog/pokemon-picker-dialog';

type BattlePokemon = {
  pokemon: PokemonModel;
  level: number;
  hpMax: number;
  hpCurrent: number;
};

type BattleActionLog = {
  actor: 'you' | 'enemy';
  moveName: string;
  damage: number;
  crit: boolean;
  roll: number;
  effectiveness: number;
  stab: number;
};

@Component({
  selector: 'app-combat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule],
  templateUrl: './combat.html',
  styleUrls: ['./combat.css'],
})
export class Combat implements OnInit {
  private authService = inject(AuthService);
  private teamService = inject(TeamService);
  private pokemonService = inject(PokemonService);
  private moveService = inject(MoveService);
  private typeService = inject(TypeService);
  private dialog = inject(MatDialog);

  // --- Constants
  readonly level = 50;
  readonly iv = 31;
  readonly ev = 0;

  // --- Data
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  teams = signal<TeamModel[]>([]);
  selectedTeamId = signal<string>('');
  teamEntries = signal<TeamPokemonSlot[]>([]);
  teamPokemons = signal<PokemonModel[]>([]);
  selectedPokemonId = signal<number | null>(null);
  selectedEnemyId = signal<number>(1);

  allMoves = signal<MoveModel[]>([]);
  typeRows = signal<TypeEffectivenessRow[]>([]);

  // --- Battle state
  you = signal<BattlePokemon | null>(null);
  enemy = signal<BattlePokemon | null>(null);

  yourMoves = signal<MoveModel[]>([]);
  enemyMoves = signal<MoveModel[]>([]);

  log = signal<BattleActionLog[]>([]);

  // --- Derived
  isReady = computed(() => !!this.you() && !!this.enemy());
  isFinished = computed(() => {
    const you = this.you();
    const enemy = this.enemy();
    if (!you || !enemy) return false;
    return you.hpCurrent <= 0 || enemy.hpCurrent <= 0;
  });

  ngOnInit(): void {
    this.dataLoad();
  }

  /** Carga base: sesión -> moves -> tabla de tipos -> equipos. */
  private dataLoad(): void {
    this.loading.set(true);
    this.error.set(null);

    const currentUser = this.authService.currentUser();
    if (!currentUser?._id) {
      this.loading.set(false);
      this.error.set('Necesitas iniciar sesión para combatir.');
      return;
    }

    // Load all moves + type chart + user teams
    this.moveService.get().subscribe({
      next: (moves) => {
        this.allMoves.set(moves ?? []);
        this.typeService.get().subscribe({
          next: (rows) => {
            const normalized = (rows ?? [])
              .map((r) => this.normalizeTypeRow(r))
              .filter((r): r is TypeEffectivenessRow => r !== null);
            this.typeRows.set(normalized);
            this.teamService.getByUserId(currentUser._id).subscribe({
              next: (teams) => {
                const teamList = teams ?? [];
                this.teams.set(teamList);

                // Select first team by default
                const firstTeamId = (teamList?.[0]?._id) ?? '';
                if (!firstTeamId) {
                  this.loading.set(false);
                  this.error.set('No tienes equipos guardados. Crea uno en Team Builder.');
                  return;
                }

                this.onSelectTeam(firstTeamId);
              },
              error: () => {
                this.loading.set(false);
                this.error.set('No se pudieron cargar tus equipos.');
              },
            });
          },
          error: () => {
            this.loading.set(false);
            this.error.set('No se pudo cargar la tabla de tipos.');
          },
        });
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudieron cargar los movimientos.');
      },
    });
  }

  private normalizeTypeRow(row: any): TypeEffectivenessRow | null {
    if (!row || typeof row !== 'object') return null;

    const attacking = row.atacante;
    const defender = row.defensor;
    const multiplier = row.multiplicador;

    if (typeof attacking !== 'string' || typeof defender !== 'string') return null;
    const m = Number(multiplier);
    if (!Number.isFinite(m)) return null;

    return {
      _id: row._id,
      attacking_type: this.normalizeTypeName(attacking),
      defender_type: this.normalizeTypeName(defender),
      multiplier: m,
    };
  }

  /** Cambia de equipo y prepara el combate. */
  onSelectTeam(teamId: string): void {
    if (!teamId) return;
    this.selectedTeamId.set(teamId);

    const team = (this.teams() ?? []).find((t) => t?._id === teamId);
    const entries = (team?.pokemons ?? []) as TeamPokemonSlot[];
    this.teamEntries.set(entries);

    const ids = entries.map((e) => e.pokemonId);
    this.pokemonService.getByIds(ids).subscribe({
      next: (pokemons) => {
        this.teamPokemons.set(pokemons ?? []);

        const defaultPokemonId = (pokemons?.[0]?.id) ?? null;
        this.selectedPokemonId.set(defaultPokemonId);
        this.setupBattle(defaultPokemonId, this.selectedEnemyId());
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudieron cargar los Pokémon del equipo.');
      },
    });
  }

  /** Cambia tu Pokémon y reinicia el combate. */
  onSelectPokemon(pokemonId: number | null): void {
    if (!pokemonId || !Number.isFinite(pokemonId)) return;
    this.selectedPokemonId.set(pokemonId);
    this.setupBattle(pokemonId, this.selectedEnemyId());
  }

  openEnemyPicker(): void {
    const dialogRef = this.dialog.open(PokemonPickerDialog, {
      data: {
        title: 'Elegir enemigo',
        subtitle: 'Selecciona el Pokémon enemigo para el combate:',
        actionLabel: 'Elegir',
      },
      width: '980px',
      maxWidth: '96vw',
    });

    dialogRef.afterClosed().subscribe((picked: PokemonModel | null) => {
      if (!picked?.id) return;
      this.selectedEnemyId.set(picked.id);
      this.setupBattle(this.selectedPokemonId(), picked.id);
    });
  }

  /** Prepara (o reinicia) el estado del combate. */
  private setupBattle(yourPokemonId: number | null, enemyPokemonId: number | null): void {
    this.loading.set(true);
    this.error.set(null);
    this.log.set([]);

    const yourPokemon = (this.teamPokemons() ?? []).find((p) => p.id === yourPokemonId);
    if (!yourPokemon) {
      this.loading.set(false);
      this.error.set('Selecciona un Pokémon válido.');
      return;
    }

    const you: BattlePokemon = this.makeBattlePokemon(yourPokemon);
    this.you.set(you);

    const enemyId = Number(enemyPokemonId);
    if (!Number.isFinite(enemyId) || enemyId <= 0) {
      this.loading.set(false);
      this.error.set('Selecciona un enemigo válido.');
      return;
    }

    this.pokemonService.getById(enemyId).subscribe({
      next: (enemyPokemon) => {
        if (!enemyPokemon) {
          this.loading.set(false);
          this.error.set('No se pudo cargar el Pokémon enemigo.');
          return;
        }

        const enemy: BattlePokemon = this.makeBattlePokemon(enemyPokemon);
        this.enemy.set(enemy);

        this.yourMoves.set(this.resolveMovesForTeamPokemon(yourPokemon.id));
        const enemyMoves = this.randomDamagingMoves(enemyPokemon.id, 4);
        this.enemyMoves.set(
          enemyMoves.length > 0
            ? enemyMoves
            : this.pickRandomUnique(
                (this.allMoves() ?? []).filter((m) => this.isDamagingMove(m)),
                4,
              ),
        );

        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudo cargar el Pokémon enemigo.');
      },
    });
  }

  // --- Battle actions
  /** Ejecuta un turno: tú atacas y el enemigo responde si sigue vivo. */
  useMove(move: MoveModel): void {
    const you = this.you();
    const enemy = this.enemy();
    if (!you || !enemy) return;
    if (this.isFinished()) return;

    // Elegir movimiento enemigo al inicio del turno (para poder decidir orden).
    const enemyMove = this.pickRandomMove(this.enemyMoves());
    if (!enemyMove) return;

    // Orden del turno según Speed (desempate aleatorio).
    const yourSpeed = this.getBattleSpeed(you);
    const enemySpeed = this.getBattleSpeed(enemy);
    const youGoFirst =
      yourSpeed > enemySpeed || (yourSpeed === enemySpeed && Math.random() < 0.5);

    if (youGoFirst) {
      this.performAttack({ actor: 'you', move });

      const afterEnemy = this.enemy();
      if (!afterEnemy || afterEnemy.hpCurrent <= 0) return;

      this.performAttack({ actor: 'enemy', move: enemyMove });
      return;
    }

    // Enemigo va primero
    this.performAttack({ actor: 'enemy', move: enemyMove });

    const afterYou = this.you();
    if (!afterYou || afterYou.hpCurrent <= 0) return;

    this.performAttack({ actor: 'you', move });
    return;
  }

  private getBattleSpeed(p: BattlePokemon): number {
    return this.calcStat(p.pokemon.speed, this.iv, this.ev, p.level);
  }

  private performAttack(params: { actor: 'you' | 'enemy'; move: MoveModel }): void {
    const attackerState = params.actor === 'you' ? this.you() : this.enemy();
    const defenderState = params.actor === 'you' ? this.enemy() : this.you();
    if (!attackerState || !defenderState) return;
    if (attackerState.hpCurrent <= 0 || defenderState.hpCurrent <= 0) return;

    const result = this.computeDamage({
      attacker: attackerState.pokemon,
      defender: defenderState.pokemon,
      move: params.move,
      level: attackerState.level,
    });

    const dmg = Math.min(defenderState.hpCurrent, result.damage);
    const updatedDefender: BattlePokemon = {
      ...defenderState,
      hpCurrent: defenderState.hpCurrent - dmg,
    };

    if (params.actor === 'you') {
      this.enemy.set(updatedDefender);
    } else {
      this.you.set(updatedDefender);
    }

    this.log.update((prev) => [
      {
        actor: params.actor,
        moveName: params.move.name,
        damage: dmg,
        crit: result.crit,
        roll: result.roll,
        effectiveness: result.effectiveness,
        stab: result.stab,
      },
      ...prev,
    ]);
  }

  /** Reinicia el combate manteniendo el Pokémon seleccionado. */
  resetBattle(): void {
    this.setupBattle(this.selectedPokemonId(), this.selectedEnemyId());
  }

  // --- Helpers

  /** Resuelve hasta 4 movimientos (guardados + relleno compatible). */
  private resolveMovesForTeamPokemon(pokemonId: number): MoveModel[] {
    const entry = (this.teamEntries() ?? []).find((e) => e.pokemonId === pokemonId);
    const savedIds = new Set((entry?.moves ?? []).map(String));

    const allMoves = this.allMoves() ?? [];
    const savedMoves = allMoves
      .filter((m) => savedIds.has(String(m._id)))
      .filter((m) => this.isDamagingMove(m));

    // Fill up to 4 with random damaging moves the Pokémon can learn
    const filled: MoveModel[] = [...savedMoves];
    if (filled.length >= 4) return filled.slice(0, 4);

    const candidates = allMoves
      .filter((m) => this.isDamagingMove(m) && (m.learned_by_ids ?? []).includes(pokemonId))
      .filter((m) => !savedIds.has(String(m._id)));

    const needed = 4 - filled.length;
    filled.push(...this.pickRandomUnique(candidates, needed));

    return filled.slice(0, 4);
  }

  /** Movimientos aleatorios de daño compatibles por `learned_by_ids`. */
  private randomDamagingMoves(pokemonId: number, count: number): MoveModel[] {
    const allMoves = this.allMoves() ?? [];
    const candidates = allMoves.filter(
      (m) => this.isDamagingMove(m) && (m.learned_by_ids ?? []).includes(pokemonId),
    );
    return this.pickRandomUnique(candidates, count);
  }

  /** Movimiento de daño: `power > 0` y `damage_class != status`. */
  private isDamagingMove(move: MoveModel): boolean {
    const power = Number(move?.power);
    if (!Number.isFinite(power) || power <= 0) return false;
    const dmgClass = String(move?.damage_class ?? '').toLowerCase();
    if (dmgClass === 'status') return false;
    return true;
  }

  private pickRandomMove(moves: MoveModel[] | null | undefined): MoveModel | null {
    const list = (moves ?? []).filter(Boolean);
    if (list.length === 0) return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx] ?? null;
  }

  /** Aleatorio sin repetición. */
  private pickRandomUnique<T>(list: T[], count: number): T[] {
    if (count <= 0) return [];
    const copy = [...list];
    const result: T[] = [];

    while (copy.length > 0 && result.length < count) {
      const idx = Math.floor(Math.random() * copy.length);
      const [picked] = copy.splice(idx, 1);
      if (picked !== undefined) result.push(picked);
    }

    return result;
  }

  /** Crea el estado de combate (PS max y actuales). */
  private makeBattlePokemon(pokemon: PokemonModel): BattlePokemon {
    const hpMax = this.calcHp(pokemon.hp, this.iv, this.ev, this.level);
    return {
      pokemon,
      level: this.level,
      hpMax,
      hpCurrent: hpMax,
    };
  }

  hpPct(p: BattlePokemon | null): number {
    if (!p) return 0;
    if (p.hpMax <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((p.hpCurrent / p.hpMax) * 100)));
  }

  /** PS = [((2*Base+IV+EV/4)*Nivel)/100] + Nivel + 10 */
  private calcHp(base: number, iv: number, ev: number, level: number): number {
    const Base = Number(base) || 0;
    const IV = Number(iv) || 0;
    const EV = Number(ev) || 0;
    const Nivel = Number(level) || 1;

    const hp = (((2 * Base + IV + EV / 4) * Nivel) / 100) + Nivel + 10;
    return Math.max(1, Math.floor(hp));
  }

  /** Stat no-PS (Attack/Defense/SpAtk/SpDef). */
  private calcStat(base: number, iv: number, ev: number, level: number): number {
    const Base = Number(base) || 0;
    const IV = Number(iv) || 0;
    const EV = Number(ev) || 0;
    const Nivel = Number(level) || 1;

    const stat = (((2 * Base + IV + EV / 4) * Nivel) / 100) + 5;
    return Math.max(1, Math.floor(stat));
  }

  /** Efectividad por tipos (si hay 2, multiplica). */
  private getEffectiveness(attackingType: string, defender: PokemonModel): number {
    const atk = this.normalizeTypeName(attackingType);
    const d1 = this.normalizeTypeName(defender?.type1);
    const d2 = defender?.type2 ? this.normalizeTypeName(defender.type2) : '';

    const lookup = this.typeRows();

    const mult1 = this.findMultiplier(lookup, atk, d1);
    const mult2 = d2 ? this.findMultiplier(lookup, atk, d2) : 1;

    return mult1 * mult2;
  }

  private normalizeTypeName(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
  }

  private findMultiplier(rows: TypeEffectivenessRow[], atk: string, def: string): number {
    if (!atk || !def) return 1;

    const row = (rows ?? []).find((r) => r.attacking_type === atk && r.defender_type === def);
    const m = Number(row?.multiplier);
    return Number.isFinite(m) ? m : 1;
  }

  /** Daño: ((((2*N/5)+2)*Poder*(A/D))/50+2) * STAB * Efectividad */
  private computeDamage(params: {
    attacker: PokemonModel;
    defender: PokemonModel;
    move: MoveModel;
    level: number;
  }): { damage: number; crit: boolean; roll: number; stab: number; effectiveness: number } {
    const { attacker, defender, move } = params;

    const Nivel = Number(params.level) || this.level;
    const Poder = Math.max(0, Number(move.power) || 0);

    const dmgClass = String(move.damage_class ?? '').toLowerCase();
    const isPhysical = dmgClass === 'physical';
    const isSpecial = dmgClass === 'special';

    // Fallback si no es physical/special
    const attackStat = isPhysical
      ? this.calcStat(attacker.attack, this.iv, this.ev, Nivel)
      : isSpecial
        ? this.calcStat(attacker.special_attack, this.iv, this.ev, Nivel)
        : this.calcStat(attacker.attack, this.iv, this.ev, Nivel);

    const defenseStat = isPhysical
      ? this.calcStat(defender.defense, this.iv, this.ev, Nivel)
      : isSpecial
        ? this.calcStat(defender.special_defense, this.iv, this.ev, Nivel)
        : this.calcStat(defender.defense, this.iv, this.ev, Nivel);

    const A = Math.max(1, attackStat);
    const D = Math.max(1, defenseStat);

    const crit = Math.random() < 0.0417; // 4.17% de probabilidad de crítico
    const roll = +(Math.random() * (1.00 - 0.85) + 0.85).toFixed(2);  // Baremo entre 0.85 y 1.00 (el + convierte a número porque toFixed devuelve string)

    const stab = this.hasStab(attacker, move) ? 1.5 : 1;
    const effectiveness = this.getEffectiveness(move.type, defender);

    const base = ((((2 * Nivel) / 5) + 2) * Poder * (A / D)) / 50 + 2;
    const raw = base * (crit ? 1.5 : 1) * roll * stab * effectiveness;

    const damage = Math.max(1, Math.floor(raw));
    return { damage, crit, roll, stab, effectiveness };
  }

  private hasStab(attacker: PokemonModel, move: MoveModel): boolean {
    const moveType = this.normalizeTypeName(move?.type);
    return (
      moveType === this.normalizeTypeName(attacker?.type1) ||
      moveType === this.normalizeTypeName(attacker?.type2)
    );
  }

  formatMoveName(name: string | null | undefined): string {
    if (!name) return '';
    return name.replace(/-/g, ' ');
  }

  formatEffectiveness(mult: number): string {
    const m = Number(mult);
    if (!Number.isFinite(m)) return 'x1';
    if (m === 0) return 'x0';
    if (m === 0.25) return 'x¼';
    if (m === 0.5) return 'x½';
    if (m === 1) return 'x1';
    if (m === 2) return 'x2';
    if (m === 4) return 'x4';
    return `x${m}`;
  }
}
