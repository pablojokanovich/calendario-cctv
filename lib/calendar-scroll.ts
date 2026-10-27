export function createMonthScrollGesture() {
  let distance = 0;
  let lastTime = -Infinity;
  let lastDirection = 0;
  let locked = false;
  let lockedUntil = 0;
  return (delta: number, atStart: boolean, atEnd: boolean, time: number) => {
    if (!Number.isFinite(delta) || !delta) return { month: 0, consume: false };
    const direction = Math.sign(delta);
    const gap = time - lastTime;
    lastTime = time;
    // A trackpad's momentum must not skip several months after one gesture.
    if (locked && (time < lockedUntil || gap < 240)) return { month: 0, consume: true };
    locked = false;
    if (direction < 0 ? !atStart : !atEnd) {
      distance = 0;
      lastDirection = direction;
      return { month: 0, consume: false };
    }
    if (gap > 240 || lastDirection !== direction) distance = 0;
    lastDirection = direction;
    distance += Math.abs(delta);
    if (distance < 100) return { month: 0, consume: true };
    distance = 0;
    locked = true;
    lockedUntil = time + 800;
    return { month: direction, consume: true };
  };
}
