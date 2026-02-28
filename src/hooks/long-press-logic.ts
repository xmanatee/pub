const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 10;

export interface LongPressState {
  timer: ReturnType<typeof setTimeout> | null;
  start: { x: number; y: number } | null;
  fired: boolean;
  touchActive: boolean;
}

export function createState(): LongPressState {
  return { timer: null, start: null, fired: false, touchActive: false };
}

function cancel(state: LongPressState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.start = null;
}

export function endTouch(state: LongPressState): void {
  cancel(state);
  state.touchActive = false;
}

export function fire(state: LongPressState, onActivate: () => void): void {
  cancel(state);
  if (!state.fired) {
    state.fired = true;
    onActivate();
  }
}

export function handlePointerDown(
  state: LongPressState,
  pointerType: string,
  clientX: number,
  clientY: number,
  onActivate: () => void,
): void {
  if (pointerType !== "touch") return;
  cancel(state);
  state.fired = false;
  state.touchActive = true;
  state.start = { x: clientX, y: clientY };
  state.timer = setTimeout(() => fire(state, onActivate), LONG_PRESS_MS);
}

export function handlePointerMove(state: LongPressState, clientX: number, clientY: number): void {
  if (!state.start) return;
  const dx = clientX - state.start.x;
  const dy = clientY - state.start.y;
  if (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX) cancel(state);
}

export function handleContextMenu(state: LongPressState, onActivate: () => void): void {
  if (state.touchActive && state.start === null && !state.fired) return;
  if (!state.touchActive) state.fired = false;
  fire(state, onActivate);
}
