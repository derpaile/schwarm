'use client';

import { useEffect, useRef, useState } from 'react';
import { Fish, Waves, CircleDot, Pause, Play, SlidersHorizontal, X, Eye, ArrowUpRight, RotateCcw, Maximize, Minimize, Info, Plus, Minus, Scan, Focus, ChevronDown, Orbit, Shield, Eraser, Clapperboard, Swords } from 'lucide-react';
import { bindCameraInput } from '@/lib/camera-input';
import { FISH_SPECIES, PREDATOR_SPECIES, MAX_PREDATORS } from '@/lib/species';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Ocean, MAX_FISH, simulationStep, DEFAULT_SETTINGS, EMPTY_SNAPSHOT, type Scenario, type Tool, type Settings, type Snapshot } from '@/lib/ocean';
import { registerOceanTools, type OceanModelContext } from '@/lib/webmcp';

const initial: Settings = { ...DEFAULT_SETTINGS };
const tools = [ { id: 'fish' as Tool, label: 'Fische', icon: Fish, key: '1', hint: 'Klicken, um Jungfische auszusetzen. Gedrückt halten für mehr.' },
  { id: 'food' as Tool, label: 'Futter', icon: CircleDot, key: '2', hint: 'Klicken, um Futter zu streuen. Schwärme folgen der Futterstelle.' },
  { id: 'wave' as Tool, label: 'Schreckwelle', icon: Waves, key: '3', hint: 'Klicken, um eine Fluchtwelle durch den Schwarm zu schicken.' },
  { id: 'vortex' as Tool, label: 'Strudel', icon: Orbit, key: '4', hint: 'Ein Strudel lenkt Schwärme um. Erneut ins Zentrum klicken dreht die Richtung.' },
  { id: 'refuge' as Tool, label: 'Schutzzone', icon: Shield, key: '5', hint: 'Hier finden Fische Ruhe. Räuber meiden die Schutzzone.' },
  { id: 'erase' as Tool, label: 'Entfernen', icon: Eraser, key: '6', hint: 'Eine Futterstelle, Schutzzone oder einen Strudel anklicken, um sie zu entfernen.' },
  { id: 'predator' as Tool, label: 'Räuber', icon: Swords, key: '7', hint: 'Art auswählen und klicken, um einen Räuber auszusetzen.' } ];
const formatTime = (seconds: number) => `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor(seconds / 60 % 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export default function Home() {
  const fishCanvas = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null), engine = useRef<Ocean | null>(null);
  const [settings, setSettings] = useState(initial), [tool, setTool] = useState<Tool>('fish');
  const [paused, setPaused] = useState(false), [zen, setZen] = useState(false), [panel, setPanel] = useState(false), [info, setInfo] = useState(false);
  const [full, setFull] = useState(false), [toast, setToast] = useState(''), [ready, setReady] = useState(false);
  const [stats, setStats] = useState<Snapshot>({ ...EMPTY_SNAPSHOT, count: initial.population });
  const hold = useRef<ReturnType<typeof setInterval> | null>(null), toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const pointer = useRef({ x: 0, y: 0 });
  const notify = (text: string) => { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2800); };
  useEffect(() => {
    if (!canvas.current) return;
    const ocean = new Ocean(canvas.current, fishCanvas.current); engine.current = ocean;
    const unregisterTools = registerOceanTools(ocean, (document as Document & { modelContext?: OceanModelContext }).modelContext);
    try { const saved = JSON.parse(localStorage.getItem('schwarm-settings') || 'null'); if (saved) {
      const sane = { ...initial, speed: [0.5, 1, 2].includes(saved.speed) ? saved.speed : 1,
        cohesion: Math.max(0.3, Math.min(2, Number(saved.cohesion) || 1)), current: Math.max(0, Math.min(1.5, Number(saved.current) || 0)),
        population: Math.max(400, Math.min(MAX_FISH, Number(saved.population) || initial.population)), predators: saved.predators !== false, trails: saved.trails !== false, events: saved.events !== false, night: saved.night === true, alarmView: saved.alarmView === true, brush: Math.max(25,Math.min(500,Number(saved.brush) || 100)), fishType: Number.isInteger(saved.fishType) && FISH_SPECIES[saved.fishType] ? saved.fishType : 0, predatorType: Number.isInteger(saved.predatorType) && PREDATOR_SPECIES[saved.predatorType] ? saved.predatorType : 0 };
      ocean.settings = sane; setSettings(sane); ocean.reset();
    } } catch { /* Storage is optional. */ }
    const resize = () => { ocean.resize(window.innerWidth, window.innerHeight); ocean.draw(); };
    resize(); setReady(true);
    let frame = 0, last = 0, accumulator = 0, report = 0, frames = 0, measured = 0;
    const animate = (now: number) => {
      if (!last) last = now;
      const wallDt = (now - last) / 1000;
      const realDt = Math.min(wallDt,0.12); last = now;
      if (!document.hidden) {
        if (!ocean.paused) {
          accumulator += realDt * ocean.settings.speed;
          const workStart = performance.now();
          const tick = simulationStep(ocean.count);
          let steps = 0;
          while (accumulator >= tick && steps < 3) {
            ocean.step(tick); accumulator -= tick; steps++;
            if (performance.now() - workStart >= 12) break;
          }
          if (steps) ocean.simulationMs += ((performance.now() - workStart) / steps - ocean.simulationMs) * 0.08;
          // Drop overdue time rather than locking the interface into catch-up work.
          accumulator = Math.min(accumulator,tick);
        } else accumulator = 0;
        ocean.updateCamera(realDt);
        ocean.draw(ocean.paused ? 0 : accumulator); frames++; measured += wallDt;
        if (now - report > 600) { setStats(ocean.snapshot(frames / Math.max(0.01, measured))); report = now; frames = 0; measured = 0; }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const endInteraction = () => { if (hold.current) clearInterval(hold.current); hold.current = null; dragging.current = false; };
    const visible = () => { last = 0; accumulator = 0; endInteraction(); };
    const removeCameraInput = bindCameraInput(canvas.current,ocean,() => ({ width:window.innerWidth,height:window.innerHeight }));
    window.addEventListener('blur', endInteraction);
    window.addEventListener('resize', resize); document.addEventListener('visibilitychange', visible);
    return () => { ocean.dispose(); removeCameraInput(); window.removeEventListener('blur', endInteraction); unregisterTools(); cancelAnimationFrame(frame); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visible);
      if (hold.current) clearInterval(hold.current); if (toastTimer.current) clearTimeout(toastTimer.current); engine.current = null; };
  }, []);
  useEffect(() => { if (engine.current) engine.current.settings = settings;
    if (ready) try { localStorage.setItem('schwarm-settings', JSON.stringify(settings)); } catch { /* Optional preference storage. */ }
  }, [settings, ready]);
  useEffect(() => { if (engine.current) engine.current.paused = paused; }, [paused]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable],[role="slider"],[role="switch"]')) return;
      if (e.code === 'Space' && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); setPaused(p => !p); }
      if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) setTool(tools[Number(e.key) - 1].id);
      if (e.key.toLowerCase() === 'h') setZen(z => !z);
      if (e.key.toLowerCase() === 'f') engine.current?.followNext();
      if (e.key.toLowerCase() === 'c' && engine.current) engine.current.setAutomatic(!engine.current.automatic);
      if (e.key === '0') engine.current?.resetCamera();
      if (e.key === '+' || e.key === '=') engine.current?.zoomAt(1.25);
      if (e.key === '-') engine.current?.zoomAt(0.8);
      if (e.key === 'Escape') { setZen(false); setPanel(false); setInfo(false); engine.current?.resetCamera(); }
    };
    const fullscreenChange = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', key); document.addEventListener('fullscreenchange', fullscreenChange);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fullscreenChange); };
  }, []);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings(s => ({ ...s, [key]: value }));
  const stopHold = () => { if (hold.current) clearInterval(hold.current); hold.current = null; };
  useEffect(() => { stopHold(); dragging.current = false; }, [tool, zen]);
  const interact = () => {
    if (zen) return;
    const n = engine.current?.interact(tool, pointer.current.x, pointer.current.y);
    if (tool === 'fish') notify(n ? `+${n} ${FISH_SPECIES[settings.fishType].plural} · finden ihren Schwarm` : `${MAX_FISH.toLocaleString('de-DE')} Fische · der Ozean ist gut gefüllt`);
    if (tool === 'predator') notify(n ? `${PREDATOR_SPECIES[settings.predatorType].name} ausgesetzt` : !settings.predators ? 'Räuber unter „Welt einstellen“ einschalten' : `Maximal ${MAX_PREDATORS} Räuber im Ozean`);
    if (tool === 'food') notify('Futter treibt für 25 Sekunden im Wasser');
    if (tool === 'wave') notify('Ein Impuls. Viele Reaktionen.');
    if (tool === 'vortex') notify('Der Strudel verändert die Strömung für 65 Sekunden');
    if (tool === 'refuge') notify('Schutzzone · ein Rückzugsort für den Schwarm');
    if (tool === 'erase') notify(n ? 'Eingriff entfernt' : 'Hier liegt kein entfernbarer Eingriff');
    if (paused) { engine.current?.draw(); if (engine.current) setStats(engine.current.snapshot()); }
  };
  const scenario = (name: Scenario) => { const ocean = engine.current; if (!ocean) return; ocean.applyScenario(name); setSettings({ ...ocean.settings }); setStats(ocean.snapshot()); notify('Eine neue Welt beginnt'); };
  const replenish = () => { const ocean = engine.current; if (!ocean) return;
    const missing = Math.max(0,settings.population - ocean.count); let added = 0;
    for (let k = 0; k < Math.ceil(missing / 250); k++) added += ocean.spawn(ocean.width * (0.15 + Math.random() * 0.7),ocean.height * (0.2 + Math.random() * 0.6),Math.min(250,missing - added),false,Math.random() * Math.PI * 2,75);
    setStats(ocean.snapshot()); notify(added ? `+${added.toLocaleString('de-DE')} Fische · der Ozean füllt sich` : 'Der gewünschte Bestand ist schon erreicht');
  };
  const fullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setZen(true); } };
  return <main className={`ocean-app ${zen ? 'zen' : ''} ${settings.night ? 'night' : ''}`}>
    <div className="ocean-light" aria-hidden="true" />
    <canvas ref={fishCanvas} className="fish-canvas" aria-hidden="true" />
    <canvas ref={canvas} className={`ocean-canvas tool-${tool}`} aria-label="Lebende Unterwasserwelt. Mit den Werkzeugen Fische, Futter oder Schreckwellen hinzufügen." tabIndex={0}
      onContextMenu={e => e.preventDefault()}
      onPointerDown={e => { if (e.button > 2) return; stopHold(); e.currentTarget.setPointerCapture(e.pointerId); pointer.current = { x: e.clientX, y: e.clientY };
        dragging.current = zen || e.shiftKey || e.button !== 0;
        if (dragging.current) return;
        interact(); if (tool === 'fish') hold.current = setInterval(interact, 240); }}
      onPointerMove={e => { if (dragging.current) engine.current?.pan(e.clientX - pointer.current.x, e.clientY - pointer.current.y); pointer.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={() => { stopHold(); dragging.current = false; }} onPointerCancel={() => { stopHold(); dragging.current = false; }} onLostPointerCapture={() => { stopHold(); dragging.current = false; }}
      onKeyDown={e => { if (e.key === 'Enter') { pointer.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }; interact(); } }} />
    <header className="topbar chrome">
      <div className="brand"><div className="brand-icon"><Fish size={27} strokeWidth={1.3} /></div><div><h1>SCHWARM</h1><p>Ein Ozean. Kein Anführer.</p></div></div>
      <div className="top-actions"><span className="live"><i /> LEBEN IM OFFENEN WASSER</span>
        <button className={`icon-button ${info ? 'active' : ''}`} aria-label="Über diese Welt" title="Über diese Welt" onClick={() => { setInfo(!info); setPanel(false); }}><Info size={19} /></button>
        <button className="icon-button fullscreen" aria-label={full ? 'Vollbild verlassen' : 'Vollbild'} title="Vollbild" onClick={fullscreen}>{full ? <Minimize size={19} /> : <Maximize size={19} />}</button>
      </div>
    </header>
    <aside className="population chrome" aria-label="Bewohner">
      <div className="eyebrow">DIE BEWOHNER</div>
      <div className="population-main"><strong>{stats.count.toLocaleString('de-DE')}</strong><span>Schwarmfische</span></div>
      <div className="fish-census">{FISH_SPECIES.map((fish,i) => <span key={fish.name}><i className="species-dot" style={{ background:fish.color }} />{stats.fishCounts[i].toLocaleString('de-DE')} {fish.plural}</span>)}</div>
      <div className="species predator-census">{PREDATOR_SPECIES.map((predator,i) => <span key={predator.name}><i className="species-dot" style={{ background:predator.color }} />{stats.predatorCounts[i]} {predator.plural}</span>)}</div>
      <div className="alarm-meter" title={`${stats.alarm} % der Fische reagieren auf Gefahr`}><span style={{ width: `${stats.alarm}%` }} /></div>
      <div className="ecosystem-status"><i />{stats.alarm > 25 ? 'Fluchtwelle im Schwarm' : stats.alarm > 5 ? 'Bewegung im Schwarm' : 'Die Welt findet ihr Gleichgewicht'}</div>
    </aside>
    <div className="right-controls chrome"><button className={`settings-button ${panel ? 'active' : ''}`} onClick={() => { setPanel(!panel); setInfo(false); }} aria-expanded={panel}><SlidersHorizontal size={16} /> Welt einstellen <ChevronDown size={14} className={panel ? 'rotate' : ''} /></button></div>
    {panel && <aside className="floating-panel settings-panel chrome" aria-label="Welt einstellen">
      <div className="panel-heading"><h2>Dein Stück Ozean</h2><button className="icon-button" aria-label="Einstellungen schließen" onClick={() => setPanel(false)}><X size={17} /></button></div>
      <div className="scenario-buttons" aria-label="Neue Welt starten"><button onClick={() => scenario('calm')}>Ruhe<span>4.000 Fische</span></button><button onClick={() => scenario('migration')}>Wanderung<span>12.000 Fische</span></button><button onClick={() => scenario('hunt')}>Jagd<span>8.000 Fische</span></button></div>
      <p className="setting-help">Startet einen neuen Ozean mit eigener Dynamik.</p>
      <label className="slider-label" id="population-label">Lebensraum für <span>{settings.population.toLocaleString('de-DE')} Fische</span></label>
      <Slider aria-labelledby="population-label" min={400} max={MAX_FISH} step={100} value={[settings.population]} onValueChange={v => change('population', Array.isArray(v) ? v[0] : v)} />
      <div className="stock-row"><p className="setting-help">Nachwuchs füllt langsam auf. Weniger Platz entfernt keine Fische.</p><button onClick={replenish}>Jetzt auffüllen</button></div>
      <label className="slider-label" id="brush-label">Fische pro Klick <span>{settings.brush}</span></label>
      <Slider aria-labelledby="brush-label" min={25} max={500} step={25} value={[settings.brush]} onValueChange={v => change('brush',Array.isArray(v) ? v[0] : v)} />
      <label className="slider-label" id="cohesion-label">Zusammenhalt <span>{settings.cohesion < 0.8 ? 'Locker' : settings.cohesion > 1.3 ? 'Eng' : 'Natürlich'}</span></label>
      <Slider aria-labelledby="cohesion-label" min={0.3} max={2} step={0.1} value={[settings.cohesion]} onValueChange={v => change('cohesion', Array.isArray(v) ? v[0] : v)} />
      <label className="slider-label" id="current-label">Strömung <span>{settings.current < 0.2 ? 'Still' : settings.current > 0.9 ? 'Kräftig' : 'Sanft'}</span></label>
      <Slider aria-labelledby="current-label" min={0} max={1.5} step={0.05} value={[settings.current]} onValueChange={v => change('current', Array.isArray(v) ? v[0] : v)} />
      <div className="switch-row"><label htmlFor="predators">Räuber im Wasser</label><Switch id="predators" checked={settings.predators} onCheckedChange={v => change('predators', v)} /></div>
      <div className="switch-row"><label htmlFor="trails">Spuren der Räuber</label><Switch id="trails" checked={settings.trails} onCheckedChange={v => change('trails', v)} /></div>
      <div className="switch-row"><label htmlFor="events">Natürliche Ereignisse</label><Switch id="events" checked={settings.events} onCheckedChange={v => change('events',v)} /></div>
      <div className="switch-row"><label htmlFor="night">Nacht im Ozean</label><Switch id="night" checked={settings.night} onCheckedChange={v => change('night',v)} /></div>
      <div className="switch-row"><label htmlFor="alarm">Fluchtimpulse einfärben</label><Switch id="alarm" checked={settings.alarmView} onCheckedChange={v => change('alarmView',v)} /></div>
      <button className="reset-button" onClick={() => { const o = engine.current; if (o) { o.foods = []; o.refuges = []; o.vortices = []; o.effects = []; } notify('Alle Futterstellen, Strudel und Schutzzonen entfernt'); }}>Eingriffe aus dem Wasser entfernen</button>
      <button className="reset-button" onClick={() => { engine.current?.reset(); if (engine.current) { engine.current.draw(); setStats(engine.current.snapshot()); } notify('Ein neuer Ozean beginnt'); }}><RotateCcw size={15} /> Welt neu beginnen</button>
    </aside>}
    {info && <aside className="floating-panel info-panel chrome" aria-label="Über diese Welt"><div className="panel-heading"><h2>Niemand führt. Alle folgen.</h2><button className="icon-button" aria-label="Information schließen" onClick={() => setInfo(false)}><X size={17} /></button></div>
      <p>Jeder Fisch hält Abstand, orientiert sich bevorzugt an seiner eigenen Art und reagiert auch auf die Flucht anderer Arten. Aus diesen lokalen Regeln entstehen unterschiedliche Schwärme.</p>
      {FISH_SPECIES.map(fish => <div className="info-species" key={fish.name}><span className="species-dot" style={{ background:fish.color }} /><div><h3>{fish.plural}</h3><p>{fish.description}</p></div></div>)}
      {PREDATOR_SPECIES.map(predator => <div className="info-species" key={predator.name}><span className="species-dot" style={{ background:predator.color }} /><div><h3>{predator.plural} · {predator.behavior}</h3><p>{predator.description}</p></div></div>)}
      <p>Gefahr löst eine Flucht aus, die auf Nachbarn übergreift. Dichte Gruppen erschweren den Räubern die Zielwahl. Nachwuchs hält diese Welt lebendig.</p>
      <p>Planktonblüten locken Schwärme zusammen, wandernde Gruppen bringen neues Leben, Strudel lenken ganze Verbände um. Schutzzonen sind ein spielerischer Rückzugsort, in dem Räuber keine Fische fangen.</p>
      <p className="keyboard-help">Zwei Finger: Kamera bewegen · Pinch: Zoom<br />F: Räuber folgen · C: Kinokamera · 0: Gesamtansicht<br />Leertaste: Pause · H: Nur beobachten</p>
      <small>Eine spielerische Simulation, kein biologischer Nachweis. Die im Reel genannten Fangquoten werden hier nicht als Fakten verwendet.</small>
    </aside>}
    <div className="camera-controls chrome" aria-label="Kamera">
      {stats.focus && <div className="tracking-label"><span className="eyebrow">{stats.automatic ? 'KINOKAMERA' : 'KAMERA FOLGT'}</span><strong>{stats.focus}</strong><span className="tracking-behavior"><i />{stats.behavior}</span></div>}
      <div className="camera-bar"><button className="icon-button" aria-label="Verkleinern" title="Verkleinern (−)" onClick={() => engine.current?.zoomAt(0.8)}><Minus size={16} /></button>
        <button className="zoom-value" aria-label="Gesamtansicht wiederherstellen" title="Gesamtansicht (0)" onClick={() => engine.current?.resetCamera()}>{Math.round(stats.zoom * 100)}<span>%</span></button>
        <button className="icon-button" aria-label="Vergrößern" title="Vergrößern (+)" onClick={() => engine.current?.zoomAt(1.25)}><Plus size={16} /></button>
        <span className="toolbar-divider" /><button className={`icon-button ${stats.focus ? 'active' : ''}`} disabled={!settings.predators} aria-label="Nächstem Räuber folgen" title="Räuber folgen / wechseln (F)" onClick={() => engine.current?.followNext()}><Focus size={18} /></button>
        <button className={`icon-button ${stats.automatic ? 'active' : ''}`} aria-label="Automatische Kinokamera" aria-pressed={stats.automatic} title="Kinokamera (C)" onClick={() => engine.current?.setAutomatic(!stats.automatic)}><Clapperboard size={17} /></button>
        <button className="icon-button" aria-label="Gesamtansicht" title="Gesamtansicht (0)" onClick={() => engine.current?.resetCamera()}><Scan size={16} /></button>
      </div><span className="camera-hint">Zwei Finger zum Verschieben · Pinch zum Zoomen</span>
    </div>
    <div className="observation chrome"><span className="crosshair">+</span><span>{stats.event ? 'IM OZEAN' : settings.night ? 'NACHT IM OZEAN' : 'OFFENES MEER'}<span className="observation-sub">{stats.event || `${stats.captures} erfolgreiche Jagden · ${stats.shelters} Schutzzonen`}</span></span></div>
    <footer className="bottom chrome">
      <div className="session"><span className="eyebrow">DEINE BEOBACHTUNG</span><span className="performance-readout">{stats.fps} Bilder/s · {stats.renderer === 'gpu' ? 'Grafikkarte' : 'Standarddarstellung'}</span><span className="clock">{formatTime(stats.elapsed)}<i className={paused ? 'paused-dot' : ''} /></span></div>
      <div className="interaction">
        {(tool === 'fish' || tool === 'predator') && <div className="species-picker">
          <label htmlFor="spawn-species">{tool === 'fish' ? 'Fischart' : 'Räuberart'}</label>
          <NativeSelect id="spawn-species" value={tool === 'fish' ? settings.fishType : settings.predatorType} onChange={e => change(tool === 'fish' ? 'fishType' : 'predatorType',Number(e.target.value))}>
            {(tool === 'fish' ? FISH_SPECIES : PREDATOR_SPECIES).map((species,i) => <NativeSelectOption key={species.name} value={i}>{species.plural}</NativeSelectOption>)}
          </NativeSelect>
          <span className="species-description">{tool === 'fish' ? FISH_SPECIES[settings.fishType].description : PREDATOR_SPECIES[settings.predatorType].behavior}</span>
        </div>}
        <div className="hint">{tools.find(t => t.id === tool)?.hint}</div><div className="toolbar" aria-label="Werkzeuge">
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
