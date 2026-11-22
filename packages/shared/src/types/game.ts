export interface GameSummary {
  id: string;
  name: string;
  shortTitle: string;
  description: string;
  estimatedTime: string;
  focusLevel: string;
  icon: string;
  tags: string[];
}

export interface BaseGameAction {
  type: string;
  playerId: string;
  timestamp: number;
}

export interface ActionResult<TState> {
  success: boolean;
  newState?: TState;
  error?: string;
  clientNotification?: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface GameCompletionResult {
  isFinished: boolean;
  winnerId?: string | null; // null for draw
  reason?: string;
  finalStats?: Record<string, any>;
}

export interface GameDefinition<TState = any, TClientState = any, TAction = any> {
  id: string;
  name: string;
  description: string;
  summary: GameSummary;
  minPlayers: number;
  maxPlayers: number;
  
  createInitialState(playerIds: [string, string], options?: any): TState;
  validateAction(state: TState, playerId: string, action: TAction): ValidationResult;
  handleAction(state: TState, playerId: string, action: TAction): ActionResult<TState>;
  sanitizeState(state: TState, playerId: string): TClientState;
  checkCompletion(state: TState): GameCompletionResult;
}
