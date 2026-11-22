import { GameDefinition, GameSummary } from '@tether/shared';

export class GameRegistry {
  private games = new Map<string, GameDefinition>();

  public register(game: GameDefinition): void {
    if (this.games.has(game.id)) {
      console.warn(`[GameRegistry] Overwriting existing game registration for id: ${game.id}`);
    }
    this.games.set(game.id, game);
    console.log(`[GameRegistry] Registered game: ${game.name} (${game.id})`);
  }

  public get(gameId: string): GameDefinition | undefined {
    return this.games.get(gameId);
  }

  public getAllSummaries(): GameSummary[] {
    return Array.from(this.games.values()).map((g) => g.summary);
  }

  public isSupported(gameId: string): boolean {
    return this.games.has(gameId);
  }
}

export const gameRegistry = new GameRegistry();
