type Camera = { pan(x: number, y: number): void; zoomAt(factor: number, x: number, y: number): void };
type Viewport = { width: number; height: number };
type GestureEvent = Event & { scale: number; clientX?: number; clientY?: number };

/** Trackpad scroll pans both axes; browser pinch events zoom at the fingers. */
export function bindCameraInput(surface: EventTarget, camera: Camera, viewport: () => Viewport) {
  let gestureActive = false, previousScale = 1;
  const wheel = (event: Event) => {
    const e = event as WheelEvent;
    e.preventDefault();
    if (gestureActive) return; // Safari can send wheel and gesture events together.
    const view = viewport();
    const dx = e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.width : 1);
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.height : 1);
    if (e.ctrlKey) camera.zoomAt(Math.exp(-Math.max(-100,Math.min(100,dy)) * 0.008),e.clientX,e.clientY);
    else if (dx || dy) camera.pan(-(e.shiftKey && !dx ? dy : dx),e.shiftKey && !dx ? 0 : -dy);
  };
  const gestureStart = (event: Event) => { event.preventDefault(); gestureActive = true; previousScale = 1; };
  const gestureChange = (event: Event) => {
    const e = event as GestureEvent; e.preventDefault();
    if (!gestureActive || !Number.isFinite(e.scale) || e.scale <= 0) return;
    const view = viewport();
    camera.zoomAt(e.scale / previousScale,e.clientX ?? view.width / 2,e.clientY ?? view.height / 2);
    previousScale = e.scale;
  };
  const gestureEnd = (event: Event) => { if (gestureActive) event.preventDefault(); gestureActive = false; previousScale = 1; };
  const entries: [string, EventListener][] = [['wheel',wheel],['gesturestart',gestureStart],['gesturechange',gestureChange],['gestureend',gestureEnd]];
  for (const [name,listener] of entries) surface.addEventListener(name,listener,{ passive:false });
  if (typeof window !== 'undefined') { window.addEventListener('blur',gestureEnd); window.addEventListener('gestureend',gestureEnd,{ passive:false }); }
  return () => {
    for (const [name,listener] of entries) surface.removeEventListener(name,listener);
    if (typeof window !== 'undefined') { window.removeEventListener('blur',gestureEnd); window.removeEventListener('gestureend',gestureEnd); }
  };
}
