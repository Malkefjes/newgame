// The launch map "Canyon": '.' open, '#' rock, 'A'/'B' spawns, 'C' core.

export interface MapDef {
  name: string;
  rows: string[];
  spawnA: [number, number][];
  spawnB: [number, number][];
  core: [number, number][];
}

export const CANYON: MapDef = {
  name: 'Canyon',
  rows: [
    '...........BB...........',
    '........................',
    '....##..........##......',
    '....##..........##......',
    '.........#..............',
    '.........#.........#....',
    'A..................#..CC',
    'A.....#...............CC',
    '......#..........#......',
    '.................#......',
    '...##...................',
    '...##.........##........',
    '..............##........',
    '........................',
  ],
  spawnA: [[0, 6], [0, 7]],
  spawnB: [[11, 0], [12, 0]],
  core: [[22, 6], [23, 6], [22, 7], [23, 7]],
};

export const COLS = 24;
export const ROWS = 14;
