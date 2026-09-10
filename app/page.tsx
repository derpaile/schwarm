'use client';

import { useEffect, useRef, useState } from 'react';
import { Fish, Waves, CircleDot, Pause, Play, SlidersHorizontal, X, Eye, ArrowUpRight, RotateCcw, Maximize, Minimize, Info, Plus, ChevronDown } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Ocean, type Tool, type Settings, type Snapshot } from '@/lib/ocean';
import { registerOceanTools, type OceanModelContext } from '@/lib/webmcp';

const initial: Settings = { speed: 1, population: 1200, cohesion: 1, predators: true, trails: true, current: 0.45 };
const tools = [ { id: 'fish' as Tool, label: 'Fische', icon: Fish, key: '1', hint: 'Klicken, um 28 Sardinen auszusetzen. Gedrückt halten für mehr.' },
  { id: 'food' as Tool, label: 'Futter', icon: CircleDot, key: '2', hint: 'Klicken, um Futter zu streuen. Schwärme folgen der Futterstelle.' },
  { id: 'wave' as Tool, label: 'Schreckwelle', icon: Waves, key: '3', hint: 'Klicken, um eine Fluchtwelle durch den Schwarm zu schicken.' } ];
const formatTime = (seconds: number) => `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor(seconds / 60 % 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null), engine = useRef<Ocean | null>(null);
  const [settings, setSettings] = useState(initial), [tool, setTool] = useState<Tool>('fish');
  const [paused, setPaused] = useState(false), [zen, setZen] = useState(false), [panel, setPanel] = useState(false), [info, setInfo] = useState(false);
  const [full, setFull] = useState(false), [toast, setToast] = useState(''), [ready, setReady] = useState(false);
  const [stats, setStats] = useState<Snapshot>({ count: 1197, sharks: 2, barracudas: 3, alarm: 0, elapsed: 0, fps: 60 });
  const hold = useRef<ReturnType<typeof setInterval> | null>(null), toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const notify = (text: string) => { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2800); };
  useEffect(() => {
    if (!canvas.current) return;
    const ocean = new Ocean(canvas.current); engine.current = ocean;
    const unregisterTools = registerOceanTools(ocean, (document as Document & { modelContext?: OceanModelContext }).modelContext);
    try { const saved = JSON.parse(localStorage.getItem('schwarm-settings') || 'null'); if (saved) {
      const sane = { ...initial, speed: [0.5, 1, 2].includes(saved.speed) ? saved.speed : 1,
        cohesion: Math.max(0.3, Math.min(2, Number(saved.cohesion) || 1)), current: Math.max(0, Math.min(1.5, Number(saved.current) || 0)),
        population: Math.max(400, Math.min(3000, Number(saved.population) || 1200)), predators: saved.predators !== false, trails: saved.trails !== false };
      ocean.settings = sane; setSettings(sane); ocean.reset();
    } } catch { /* Storage is optional. */ }
    const resize = () => { ocean.resize(window.innerWidth, window.innerHeight); ocean.draw(); };
    resize(); setReady(true);
    let frame = 0, last = 0, accumulator = 0, report = 0, frames = 0, measured = 0;
    const animate = (now: number) => {
      if (!last) last = now;
      const realDt = Math.min((now - last) / 1000, 0.12); last = now;
      if (!document.hidden) {
        if (!ocean.paused) {
          accumulator += realDt * ocean.settings.speed;
          let steps = 0; while (accumulator >= 1 / 30 && steps++ < 6) { ocean.step(1 / 30); accumulator -= 1 / 30; }
          if (steps >= 6) accumulator = 0;
        } else accumulator = 0;
        ocean.draw(ocean.paused ? 0 : accumulator); frames++; measured += realDt;
        if (now - report > 600) { setStats(ocean.snapshot(frames / Math.max(0.01, measured))); report = now; frames = 0; measured = 0; }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const visible = () => { last = 0; accumulator = 0; };
    window.addEventListener('resize', resize); document.addEventListener('visibilitychange', visible);
    return () => { unregisterTools(); cancelAnimationFrame(frame); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visible);
      if (hold.current) clearInterval(hold.current); if (toastTimer.current) clearTimeout(toastTimer.current); engine.current = null; };
  }, []);
  useEffect(() => { if (engine.current) engine.current.settings = settings;
    if (ready) try { localStorage.setItem('schwarm-settings', JSON.stringify(settings)); } catch { /* Optional preference storage. */ }
  }, [settings, ready]);
  useEffect(() => { if (engine.current) engine.current.paused = paused; }, [paused]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,button,[role="slider"],[role="switch"]')) return;
      if (e.code === 'Space') { e.preventDefault(); setPaused(p => !p); }
      if (['1', '2', '3'].includes(e.key)) setTool(tools[Number(e.key) - 1].id);
      if (e.key.toLowerCase() === 'h') setZen(z => !z);
      if (e.key === 'Escape') { setZen(false); setPanel(false); setInfo(false); }
    };
    const fullscreenChange = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', key); document.addEventListener('fullscreenchange', fullscreenChange);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fullscreenChange); };
  }, []);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings(s => ({ ...s, [key]: value }));
  const stopHold = () => { if (hold.current) clearInterval(hold.current); hold.current = null; };
  const interact = () => {
    const n = engine.current?.interact(tool, pointer.current.x, pointer.current.y);
    if (tool === 'fish') notify(n ? `+${n} Sardinen · finden ihren Schwarm` : '4.000 Fische · der Ozean ist gut gefüllt');
    if (tool === 'food') notify('Futter treibt für 25 Sekunden im Wasser');
    if (tool === 'wave') notify('Ein Impuls. Viele Reaktionen.');
    if (paused) { engine.current?.draw(); if (engine.current) setStats(engine.current.snapshot()); }
  };
  const fullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setZen(true); } };
  return <main className={`ocean-app ${zen ? 'zen' : ''}`}>
    <div className="ocean-light" aria-hidden="true" />
    <canvas ref={canvas} className={`ocean-canvas tool-${tool}`} aria-label="Lebende Unterwasserwelt. Mit den Werkzeugen Fische, Futter oder Schreckwellen hinzufügen." tabIndex={0}
      onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); pointer.current = { x: e.clientX, y: e.clientY }; interact(); stopHold(); if (tool === 'fish') hold.current = setInterval(interact, 240); }}
      onPointerMove={e => { pointer.current = { x: e.clientX, y: e.clientY }; }} onPointerUp={stopHold} onPointerCancel={stopHold} onLostPointerCapture={stopHold}
      onKeyDown={e => { if (e.key === 'Enter') { pointer.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }; interact(); } }} />
    <header className="topbar chrome">
      <div className="brand"><div className="brand-icon"><Fish size={27} strokeWidth={1.3} /></div><div><h1>SCHWARM<span>®</span></h1><p>Ein Ozean. Kein Anführer.</p></div></div>
      <div className="top-actions"><span className="live"><i /> LEBEN IM OFFENEN WASSER</span>
        <button className={`icon-button ${info ? 'active' : ''}`} aria-label="Über diese Welt" title="Über diese Welt" onClick={() => { setInfo(!info); setPanel(false); }}><Info size={19} /></button>
        <button className="icon-button fullscreen" aria-label={full ? 'Vollbild verlassen' : 'Vollbild'} title="Vollbild" onClick={fullscreen}>{full ? <Minimize size={19} /> : <Maximize size={19} />}</button>
      </div>
    </header>
    <aside className="population chrome" aria-label="Bewohner">
      <div className="eyebrow">DIE BEWOHNER</div>
      <div className="population-main"><strong>{stats.count.toLocaleString('de-DE')}</strong><span>Sardinen</span></div>
      <div className="species"><span><i className="species-dot shark" />{stats.sharks} Haie</span><span><i className="species-dot barracuda" />{stats.barracudas} Barrakudas</span></div>
      <div className="ecosystem-status"><i />{stats.alarm > 25 ? 'Fluchtwelle im Schwarm' : stats.alarm > 5 ? 'Bewegung im Schwarm' : 'Die Welt findet ihr Gleichgewicht'}</div>
    </aside>
    <div className="right-controls chrome"><button className={`settings-button ${panel ? 'active' : ''}`} onClick={() => { setPanel(!panel); setInfo(false); }} aria-expanded={panel}><SlidersHorizontal size={16} /> Welt einstellen <ChevronDown size={14} className={panel ? 'rotate' : ''} /></button></div>
    {panel && <aside className="floating-panel settings-panel chrome" aria-label="Welt einstellen">
      <div className="panel-heading"><h2>Dein Stück Ozean</h2><button className="icon-button" aria-label="Einstellungen schließen" onClick={() => setPanel(false)}><X size={17} /></button></div>
      <label className="slider-label" id="population-label">Lebensraum für <span>{settings.population.toLocaleString('de-DE')} Fische</span></label>
      <Slider aria-labelledby="population-label" min={400} max={3000} step={100} value={[settings.population]} onValueChange={v => change('population', Array.isArray(v) ? v[0] : v)} />
      <p className="setting-help">Nachwuchs füllt freie Plätze langsam auf. Weniger Platz entfernt keine Fische.</p>
      <label className="slider-label" id="cohesion-label">Zusammenhalt <span>{settings.cohesion < 0.8 ? 'Locker' : settings.cohesion > 1.3 ? 'Eng' : 'Natürlich'}</span></label>
      <Slider aria-labelledby="cohesion-label" min={0.3} max={2} step={0.1} value={[settings.cohesion]} onValueChange={v => change('cohesion', Array.isArray(v) ? v[0] : v)} />
      <label className="slider-label" id="current-label">Strömung <span>{settings.current < 0.2 ? 'Still' : settings.current > 0.9 ? 'Kräftig' : 'Sanft'}</span></label>
      <Slider aria-labelledby="current-label" min={0} max={1.5} step={0.05} value={[settings.current]} onValueChange={v => change('current', Array.isArray(v) ? v[0] : v)} />
      <div className="switch-row"><label htmlFor="predators">Räuber im Wasser</label><Switch id="predators" checked={settings.predators} onCheckedChange={v => change('predators', v)} /></div>
      <div className="switch-row"><label htmlFor="trails">Spuren der Räuber</label><Switch id="trails" checked={settings.trails} onCheckedChange={v => change('trails', v)} /></div>
      <button className="reset-button" onClick={() => { engine.current?.reset(); if (engine.current) { engine.current.draw(); setStats(engine.current.snapshot()); } notify('Ein neuer Ozean beginnt'); }}><RotateCcw size={15} /> Welt neu beginnen</button>
    </aside>}
    {info && <aside className="floating-panel info-panel chrome" aria-label="Über diese Welt"><div className="panel-heading"><h2>Niemand führt. Alle folgen.</h2><button className="icon-button" aria-label="Information schließen" onClick={() => setInfo(false)}><X size={17} /></button></div>
      <p>Jede Sardine hält Abstand, übernimmt die Richtung ihrer Nachbarn und sucht ihre Nähe. Aus diesen lokalen Regeln entsteht der Schwarm.</p>
      <div className="info-species"><span className="species-dot shark" /><div><h3>Haie · die Ausdauernden</h3><p>Kreisen, suchen einzelne Fische und verfolgen sie in weiten Bögen.</p></div></div>
      <div className="info-species"><span className="species-dot barracuda" /><div><h3>Barrakudas · die Sprinter</h3><p>Nähern sich langsam, schießen nach vorn und müssen sich danach erholen.</p></div></div>
      <p>Gefahr löst eine Flucht aus, die auf Nachbarn übergreift. Dichte Gruppen erschweren den Räubern die Zielwahl. Nachwuchs hält diese Welt lebendig.</p>
      <small>Eine spielerische Simulation, kein biologischer Nachweis. Die im Reel genannten Fangquoten werden hier nicht als Fakten verwendet.</small>
    </aside>}
    <div className="observation chrome"><span className="crosshair">+</span><span>OFFENES MEER<span className="observation-sub">Lokale Regeln. Lebendige Muster.</span></span></div>
    <footer className="bottom chrome">
      <div className="session"><span className="eyebrow">DEINE BEOBACHTUNG</span><span className="clock">{formatTime(stats.elapsed)}<i className={paused ? 'paused-dot' : ''} /></span></div>
      <div className="interaction"><div className="hint">{tools.find(t => t.id === tool)?.hint}</div><div className="toolbar" aria-label="Werkzeuge">
        {tools.map(({ id, icon: Icon, label, key }) => <button key={id} className={`tool-button ${tool === id ? 'selected' : ''}`} onClick={() => setTool(id)} aria-pressed={tool === id} title={`${label} (${key})`}><Icon size={19} strokeWidth={1.6} /><span>{label}</span><kbd>{key}</kbd></button>)}
        <span className="toolbar-divider" /><button className={`icon-button pause ${paused ? 'active' : ''}`} aria-label={paused ? 'Fortsetzen' : 'Pause'} title="Pause / Fortsetzen (Leertaste)" onClick={() => setPaused(p => !p)}>{paused ? <Play size={19} /> : <Pause size={19} />}</button>
        <button className="speed" title="Zeitgeschwindigkeit ändern" aria-label={`Geschwindigkeit ${settings.speed} mal. Ändern`} onClick={() => change('speed', settings.speed === 0.5 ? 1 : settings.speed === 1 ? 2 : 0.5)}>{settings.speed.toString().replace('.', ',')}×</button>
      </div></div>
      <button className="zen-button" onClick={() => { setZen(true); setPanel(false); setInfo(false); }} title="Nur beobachten (H)"><Eye size={17} /><span>Nur beobachten</span><ArrowUpRight size={15} /></button>
    </footer>
    {zen && <button className="return-button" onClick={() => setZen(false)}><Plus size={16} /> Bedienung einblenden <kbd>H</kbd></button>}
    {paused && <div className="pause-badge"><Pause size={12} /> Zeit steht still</div>}
    <div className={`toast ${toast ? 'visible' : ''}`} role="status">{toast}</div>
    {!ready && <div className="loading-world">Der Ozean erwacht …</div>}
  </main>;
}
