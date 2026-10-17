// All tunable numbers from the spec live here. The sim reads them through a frozen object,
// so a balance build can swap in an alternate content file.

export type NodeType = 'bolt' | 'frost' | 'mortar';
export type PieceType = 'wall' | NodeType;
export type BeamType = 'arc' | 'chill' | 'minefield' | 'shatter' | 'overload' | 'tar';
export type EnemyType = 'grunt' | 'runner' | 'brute' | 'swarm' | 'flyer' | 'warden' | 'colossus';
export type OverclockId =
  | 'longTethers' | 'extraSlot' | 'hairTrigger' | 'deepFreeze' | 'bigShells' | 'conductive'
  | 'instantCharge' | 'bountyHunter' | 'compoundInterest' | 'salvage' | 'reinforcedCore' | 'resonance';

export interface NodeDef {
  name: string;
  cost: [number, number, number];
  damage: [number, number, number];
  rate: number;
  range: [number, number, number];
  minRange: number;
  air: boolean;
  slow?: [number, number, number];
  slowDuration?: number;
  splash?: [number, number, number];
  shellFlight?: number;
  projectileSpeed?: number;
}

export interface BeamDef {
  name: string;
  dps: number;
  job: string;
}

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  armor: number;
  leak: number;
  bounty: number;
  air?: boolean;
  boss?: boolean;
  spacing: number;
}

export interface OverclockDef {
  name: string;
  text: string;
}

export type WaveGroup = [EnemyType, number];

const content = {
  tickRate: 30,

  economy: {
    startGold: 250,
    lives: 20,
    clearBonusBase: 20,
    clearBonusPerWave: 5,
    interestRate: 0.1,
    interestCapBase: 15,
    interestCapPerWave: 5,
    earlyCallBase: 5,
    earlyCallPerSecond: 1,
    maxWavesOnBoard: 2,
    sellRefund: 0.7,
    bountyGrowth: 0.04,
    hpGrowth: 1.1,
  },

  wall: { name: 'Wall', cost: 10 },

  nodes: {
    bolt: {
      name: 'Bolt', cost: [50, 60, 100], damage: [9, 16, 26], rate: 2, range: [3, 3.5, 4],
      minRange: 0, air: true, projectileSpeed: 12,
    },
    frost: {
      name: 'Frost', cost: [45, 55, 90], damage: [4, 7, 11], rate: 1, range: [1.75, 2, 2.25],
      minRange: 0, air: true, slow: [0.3, 0.35, 0.4], slowDuration: 1.5,
    },
    mortar: {
      name: 'Mortar', cost: [75, 85, 130], damage: [40, 70, 115], rate: 0.5, range: [5.5, 5.5, 5.5],
      minRange: 1.5, air: false, splash: [1, 1.1, 1.25], shellFlight: 0.8,
    },
  } as Record<NodeType, NodeDef>,

  links: {
    range: 4.5,
    slots: [2, 2, 3],
    contact: 0.5,
    chargeTime: 4,
    levelStep: 0.5,
  },

  beams: {
    arc: { name: 'Arc', dps: 45, job: 'Raw damage' },
    chill: { name: 'Chill', dps: 12, job: 'Freeze zone that feeds everything downstream' },
    minefield: { name: 'Minefield', dps: 0, job: 'Crowd burst' },
    shatter: { name: 'Shatter', dps: 25, job: 'Damage amplifier' },
    overload: { name: 'Overload', dps: 20, job: 'Chain kills on swarms' },
    tar: { name: 'Tar', dps: 20, job: 'Anti-armor' },
  } satisfies Record<BeamType, BeamDef>,

  beamRules: {
    chillSlow: 0.45, chillSlowPerLevel: 0.05, chillCap: 0.6, chillLinger: 3,
    mineDamage: 80, mineRadius: 1, mineRearm: 2,
    brittle: 1.3, brittleDuration: 3,
    chargedDuration: 4, overloadBlast: 40, overloadRadius: 1,
    tarSlow: 0.2, tarLinger: 1, shred: 30, shredLinger: 3,
  },

  status: { slowCap: 0.6, bossSlowCap: 0.3 },

  enemies: {
    grunt: { name: 'Grunt', hp: 60, speed: 1.2, armor: 0, leak: 1, bounty: 4, spacing: 0.8 },
    runner: { name: 'Runner', hp: 35, speed: 2.4, armor: 0, leak: 1, bounty: 3, spacing: 0.5 },
    brute: { name: 'Brute', hp: 300, speed: 0.7, armor: 40, leak: 3, bounty: 15, spacing: 2 },
    swarm: { name: 'Swarmling', hp: 18, speed: 1.6, armor: 0, leak: 1, bounty: 1, spacing: 0.15 },
    flyer: { name: 'Flyer', hp: 60, speed: 1.3, armor: 0, leak: 2, bounty: 6, air: true, spacing: 1 },
    warden: { name: 'Warden', hp: 150, speed: 1, armor: 20, leak: 2, bounty: 12, spacing: 3 },
    colossus: { name: 'Colossus', hp: 6000, speed: 0.5, armor: 30, leak: 999, bounty: 150, boss: true, spacing: 0 },
  } as Record<EnemyType, EnemyDef>,

  bossHp: { 10: 6000, 20: 20000 } as Record<number, number>,

  warden: { interval: 5, radius: 2, shield: 40 },

  spawning: {
    groupGap: 2,
    swarmPackSize: 10,
    swarmPackGap: 3,
    spawnBOpensAt: 11,
  },

  // Swarm counts are packs of 10.
  waves: [
    [['grunt', 10]],
    [['grunt', 14]],
    [['grunt', 8], ['runner', 6]],
    [['grunt', 6], ['runner', 12]],
    [['grunt', 10], ['brute', 3]],
    [['grunt', 6], ['swarm', 3]],
    [['grunt', 10], ['flyer', 6]],
    [['grunt', 12], ['brute', 3], ['warden', 2]],
    [['runner', 15], ['swarm', 2], ['flyer', 4]],
    [['grunt', 12], ['colossus', 1]],
    [['grunt', 16], ['runner', 8]],
    [['grunt', 8], ['brute', 6], ['warden', 2]],
    [['swarm', 3], ['flyer', 6]],
    [['grunt', 8], ['runner', 20], ['warden', 3]],
    [['grunt', 10], ['brute', 8], ['warden', 3]],
    [['swarm', 3], ['flyer', 12]],
    [['runner', 16], ['brute', 6], ['flyer', 6], ['warden', 2]],
    [['runner', 20], ['brute', 10], ['warden', 4]],
    [['runner', 10], ['brute', 10], ['warden', 4], ['flyer', 10], ['swarm', 3]],
    [['brute', 6], ['warden', 4], ['flyer', 6], ['colossus', 1]],
  ] as WaveGroup[][],

  overclockWaves: [4, 8, 12, 16],

  overclocks: {
    longTethers: { name: 'Long Tethers', text: 'Link range +1.5 tiles' },
    extraSlot: { name: 'Extra Slot', text: 'All nodes +1 link slot' },
    hairTrigger: { name: 'Hair Trigger', text: 'Bolt fire rate +30%' },
    deepFreeze: { name: 'Deep Freeze', text: 'Frost slows +10 points. Chill cap rises to 70%.' },
    bigShells: { name: 'Big Shells', text: 'Mortar splash radius +40%' },
    conductive: { name: 'Conductive', text: 'All beam damage +25%' },
    instantCharge: { name: 'Instant Charge', text: 'Link charge-up time is 0' },
    bountyHunter: { name: 'Bounty Hunter', text: 'Kill bounty +25%' },
    compoundInterest: { name: 'Compound Interest', text: 'Interest rate 15%, 1.5× the cap' },
    salvage: { name: 'Salvage', text: 'Selling always refunds 100% (still build phase only)' },
    reinforcedCore: { name: 'Reinforced Core', text: '+8 lives now' },
    resonance: { name: 'Resonance', text: 'A node with every link slot filled gets +25% to its own damage' },
  } satisfies Record<OverclockId, OverclockDef>,
};

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

export type Content = typeof content;
export const CONTENT: Content = deepFreeze(content);

export function beamFor(a: NodeType, b: NodeType): BeamType {
  const k = [a, b].sort().join('+');
  switch (k) {
    case 'bolt+bolt': return 'arc';
    case 'frost+frost': return 'chill';
    case 'mortar+mortar': return 'minefield';
    case 'bolt+frost': return 'shatter';
    case 'bolt+mortar': return 'overload';
    default: return 'tar';
  }
}
