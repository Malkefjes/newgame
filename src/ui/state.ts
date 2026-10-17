import type { PieceType } from '../sim/content';

export type Fx =
  | { k: 'text'; x: number; y: number; text: string; color: string; t0: number; dur: number }
  | { k: 'ring'; x: number; y: number; r: number; color: string; t0: number; dur: number }
  | { k: 'pop'; x: number; y: number; color: string; t0: number; dur: number }
  | { k: 'leak'; x: number; y: number; t0: number; dur: number };

export interface UiState {
  tool: PieceType | null;
  selected: number | null;
  /** Mouse position in tile units, or null when off the board. */
  mouse: { x: number; y: number } | null;
  drag: null | { kind: 'link'; from: number; moved: boolean } | { kind: 'paint'; last: string };
  heat: boolean;
  paused: boolean;
  speed: 1 | 2 | 3;
  fx: Fx[];
  shakeUntil: number;
  vignetteUntil: number;
  livesPulseUntil: number;
  /** Reason text shown next to the cursor after a rejected action. */
  flash: { text: string; x: number; y: number; until: number } | null;
}

export function newUiState(): UiState {
  return {
    tool: null, selected: null, mouse: null, drag: null, heat: false, paused: false, speed: 1,
    fx: [], shakeUntil: 0, vignetteUntil: 0, livesPulseUntil: 0, flash: null,
  };
}
