// These traits define the stylized simulation, not measured biological constants.
export const FISH_SPECIES = [
  { name: 'Sardine', plural: 'Sardinen', color: '#bdd9c5', scale: 1, width: 1, speed: 37, cohesion: 1, alignment: 1, escape: 1, description: 'Silbrig, dicht und gleichmäßig. Der klassische Schwarm.' },
  { name: 'Sardelle', plural: 'Sardellen', color: '#85c7ed', scale: 0.72, width: 0.78, speed: 46, cohesion: 1.55, alignment: 1.25, escape: 1.1, description: 'Klein und blau. Bildet besonders enge, flinke Gruppen.' },
  { name: 'Makrele', plural: 'Makrelen', color: '#dbc58e', scale: 1.4, width: 1.15, speed: 58, cohesion: 0.6, alignment: 0.85, escape: 0.85, description: 'Größer und goldgrün. Zieht schneller in lockeren Verbänden.' },
] as const;
export const PREDATOR_SPECIES = [
  { name: 'Hai', plural: 'Haie', color: '#83b3b1', description: 'Kreist ausdauernd und verfolgt einzelne Fische in weiten Bögen.', behavior: 'Ausdauerjäger', cruise: 48, chase: 112, turn: 1.1, radius: 145, reach: 20, rest: 18 },
  { name: 'Barrakuda', plural: 'Barrakudas', color: '#c9a77b', description: 'Schleicht heran, sprintet geradeaus und erholt sich nach dem Angriff.', behavior: 'Sprinter', cruise: 38, chase: 61, turn: 1.8, radius: 95, reach: 14, rest: 20 },
  { name: 'Thunfisch', plural: 'Thunfische', color: '#8b9fde', description: 'Schwimmt schnell und steuert voraus, um die Bahn seiner Beute abzufangen.', behavior: 'Abfangjäger', cruise: 86, chase: 154, turn: 0.95, radius: 165, reach: 19, rest: 12 },
  { name: 'Rotfeuerfisch', plural: 'Rotfeuerfische', color: '#d99c9a', description: 'Wartet fast reglos und greift erst an, wenn ein Fisch in Reichweite kommt.', behavior: 'Lauerjäger', cruise: 9, chase: 170, turn: 3.2, radius: 65, reach: 21, rest: 16 },
] as const;
export const MAX_PREDATORS = 16;
