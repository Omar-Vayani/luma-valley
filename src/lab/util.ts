export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
export const dist = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz)
