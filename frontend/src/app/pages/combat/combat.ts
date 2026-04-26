import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../services/auth.service';
import { Team as TeamService } from '../../services/team/team';
import { Pokemon as PokemonService } from '../../services/pokemon/pokemon';
import { MoveService, MoveModel } from '../../services/move/move';
import { Type as TypeService, TypeModel as TypeEffectivenessRow } from '../../services/type/type';

import { Pokemon as PokemonModel } from '../../models/pokemon/pokemon';
import {
  Team as TeamModel,
  TeamPokemonSlot,
  normalizeTeamPokemons,
} from '../../models/team/team';

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
  effectiveness: number;
  stab: number;
};

@Component({
  selector: 'app-combat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './combat.html',
  styleUrls: ['./combat.css'],
})
export class Combat implements OnInit {
  private authService = inject(AuthService);
  private teamService = inject(TeamService);
  private pokemonService = inject(PokemonService);
  private moveService = inject(MoveService);
  private typeService = inject(TypeService);

  // --- Constants (simple defaults for now)
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
    this.bootstrap();
  }

  /**
   * Carga inicial de datos necesarios para el combate.
   * Flujo: valida sesión -> carga movimientos -> carga tabla de tipos -> carga equipos del usuario
   * y selecciona un equipo por defecto para preparar el combate.
   */
  private bootstrap(): void {
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
            this.typeRows.set(rows ?? []);
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

  /**
   * Al seleccionar un equipo:
   * - normaliza el formato del team (pokemonId + moves[])
   * - carga los Pokémon completos del backend (stats, tipos, etc.)
   * - selecciona un Pokémon por defecto para empezar a combatir.
   */
  onSelectTeam(teamId: string): void {
    if (!teamId) return;
    this.selectedTeamId.set(teamId);

    const team = (this.teams() ?? []).find((t) => t?._id === teamId);
    const entries = normalizeTeamPokemons(team?.pokemons);
    this.teamEntries.set(entries);

    const ids = entries.map((e) => e.pokemonId);
    this.pokemonService.getByIds(ids).subscribe({
      next: (pokemons) => {
        this.teamPokemons.set(pokemons ?? []);

        const defaultPokemonId = (pokemons?.[0]?.id) ?? null;
        this.selectedPokemonId.set(defaultPokemonId);
        this.setupBattle(defaultPokemonId);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudieron cargar los Pokémon del equipo.');
      },
    });
  }

  /**
   * Cambia el Pokémon del usuario que va a combatir y reinicia el estado de batalla.
   */
  onSelectPokemon(pokemonId: number | null): void {
    if (!pokemonId || !Number.isFinite(pokemonId)) return;
    this.selectedPokemonId.set(pokemonId);
    this.setupBattle(pokemonId);
  }

  /**
   * Prepara (o reinicia) el combate:
   * - crea el estado de tu Pokémon (PS max/actual según fórmula)
   * - carga un enemigo de ejemplo
   * - determina 4 movimientos de daño para ambos bandos.
   */
  private setupBattle(yourPokemonId: number | null): void {
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

    // Example enemy Pokémon
    const enemyId = 1;
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
  /**
   * Ejecuta un turno completo:
   * 1) el usuario usa un movimiento y se aplica el daño al enemigo
   * 2) si el enemigo sigue vivo, responde con un movimiento aleatorio.
   */
  useMove(move: MoveModel): void {
    const you = this.you();
    const enemy = this.enemy();
    if (!you || !enemy) return;
    if (this.isFinished()) return;

    const result = this.computeDamage({
      attacker: you.pokemon,
      defender: enemy.pokemon,
      move,
      level: you.level,
    });

    const dmg = Math.min(enemy.hpCurrent, result.damage);
    this.enemy.set({ ...enemy, hpCurrent: enemy.hpCurrent - dmg });
    this.log.update((prev) => [
      { actor: 'you', moveName: move.name, damage: dmg, effectiveness: result.effectiveness, stab: result.stab },
      ...prev,
    ]);

    const afterEnemy = this.enemy();
    if (!afterEnemy || afterEnemy.hpCurrent <= 0) return;

    // Enemy turn (simple random)
    const enemyMove = this.pickRandomMove(this.enemyMoves());
    if (!enemyMove) return;

    const counter = this.computeDamage({
      attacker: enemy.pokemon,
      defender: you.pokemon,
      move: enemyMove,
      level: enemy.level,
    });

    const counterDmg = Math.min(you.hpCurrent, counter.damage);
    this.you.set({ ...you, hpCurrent: you.hpCurrent - counterDmg });
    this.log.update((prev) => [
      { actor: 'enemy', moveName: enemyMove.name, damage: counterDmg, effectiveness: counter.effectiveness, stab: counter.stab },
      ...prev,
    ]);
  }

  /**
   * Reinicia el combate manteniendo el Pokémon seleccionado.
   */
  resetBattle(): void {
    this.setupBattle(this.selectedPokemonId());
  }

  // --- Helpers

  /**
   * Construye los 4 movimientos del usuario para el combate:
   * - prioriza los movimientos guardados en el equipo
   * - filtra solo movimientos que hacen daño
   * - si faltan, rellena con movimientos aleatorios compatibles con el Pokémon.
   */
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

  /**
   * Selecciona `count` movimientos aleatorios que hagan daño para un Pokémon dado,
   * usando `learned_by_ids` como compatibilidad.
   */
  private randomDamagingMoves(pokemonId: number, count: number): MoveModel[] {
    const allMoves = this.allMoves() ?? [];
    const candidates = allMoves.filter(
      (m) => this.isDamagingMove(m) && (m.learned_by_ids ?? []).includes(pokemonId),
    );
    return this.pickRandomUnique(candidates, count);
  }

  /**
   * Determina si un movimiento cuenta como "de daño".
   * Criterio actual: power > 0 y damage_class != status.
   */
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

  /**
   * Devuelve un array con elementos aleatorios sin repetición.
   */
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

  /**
   * Crea el estado de combate de un Pokémon:
   * calcula PS máximos con la fórmula y setea PS actuales = PS max.
   */
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

  // PS = [ ((2 * Base + IV + (EV / 4)) * Nivel) / 100 ] + Nivel + 10
  /**
   * Calcula los PS máximos según la fórmula indicada.
   */
  private calcHp(base: number, iv: number, ev: number, level: number): number {
    const Base = Number(base) || 0;
    const IV = Number(iv) || 0;
    const EV = Number(ev) || 0;
    const Nivel = Number(level) || 1;

    const hp = (((2 * Base + IV + EV / 4) * Nivel) / 100) + Nivel + 10;
    return Math.max(1, Math.floor(hp));
  }

  // Standard non-HP stat formula (needed for A/D)
  /**
   * Calcula una stat no-PS (Ataque/Defensa/SpAtk/SpDef) para poder obtener A/D.
   * Nota: no forma parte de tu petición original, pero es necesaria para la fórmula de daño.
   */
  private calcStat(base: number, iv: number, ev: number, level: number): number {
    const Base = Number(base) || 0;
    const IV = Number(iv) || 0;
    const EV = Number(ev) || 0;
    const Nivel = Number(level) || 1;

    const stat = (((2 * Base + IV + EV / 4) * Nivel) / 100) + 5;
    return Math.max(1, Math.floor(stat));
  }

  /**
   * Calcula la efectividad del tipo del movimiento contra el/los tipo(s) del defensor.
   * Si el Pokémon tiene 2 tipos, multiplica ambas efectividades.
   */
  private getEffectiveness(attackingType: string, defender: PokemonModel): number {
    const atk = String(attackingType ?? '');
    const d1 = String(defender?.type1 ?? '');
    const d2 = defender?.type2 ? String(defender.type2) : '';

    const lookup = this.typeRows();

    const mult1 = this.findMultiplier(lookup, atk, d1);
    const mult2 = d2 ? this.findMultiplier(lookup, atk, d2) : 1;

    return mult1 * mult2;
  }

  private findMultiplier(rows: TypeEffectivenessRow[], atk: string, def: string): number {
    if (!atk || !def) return 1;
    const row = (rows ?? []).find(
      (r) => String(r.attacking_type) === atk && String(r.defender_type) === def,
    );
    const m = Number(row?.multiplier);
    return Number.isFinite(m) ? m : 1;
  }

  /**
   * Aplica la fórmula de daño proporcionada:
   * Daño = ((((2*Nivel/5)+2) * Poder * (A/D)) / 50 + 2) * STAB * Efectividad
   * usando Attack/Defense o SpAtk/SpDef según damage_class.
   */
  private computeDamage(params: {
    attacker: PokemonModel;
    defender: PokemonModel;
    move: MoveModel;
    level: number;
  }): { damage: number; stab: number; effectiveness: number } {
    const { attacker, defender, move } = params;

    const Nivel = Number(params.level) || this.level;
    const Poder = Math.max(0, Number(move.power) || 0);

    const dmgClass = String(move.damage_class ?? '').toLowerCase();
    const isPhysical = dmgClass === 'physical';
    const isSpecial = dmgClass === 'special';

    // Si no es physical/special (p.ej. status), hacemos fallback a stats físicas.
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

    const stab = this.hasStab(attacker, move) ? 1.5 : 1;
    const effectiveness = this.getEffectiveness(move.type, defender);

    // Daño = ((((2 * Nivel / 5) + 2) * Poder * (A / D)) / 50 + 2) * STAB * Efectividad
    const base = ((((2 * Nivel) / 5) + 2) * Poder * (A / D)) / 50 + 2;
    const raw = base * stab * effectiveness;

    const damage = Math.max(1, Math.floor(raw));
    return { damage, stab, effectiveness };
  }

  private hasStab(attacker: PokemonModel, move: MoveModel): boolean {
    const moveType = String(move?.type ?? '');
    return moveType === String(attacker?.type1 ?? '') || moveType === String(attacker?.type2 ?? '');
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
