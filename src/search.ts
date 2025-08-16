
const SIZE = 128;
const SOUPS = 64;
const SOUSIZE = 16;
const START = 192;
const GENS = 192;
const SEGMENTS = 12;


type TransitionGrid = [[number, number, number], [number, number, number], [number, number, number]];

const TRANSITIONS: {[key: number]: {[key: string]: TransitionGrid}} = {
    0: {
        '': [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    },
    1: {
        'c': [[1, 0, 0], [0, 0, 0], [0, 0, 0]],
        'e': [[0, 1, 0], [0, 0, 0], [0, 0, 0]],
    },
    2: {
        'c': [[1, 0, 1], [0, 0, 0], [0, 0, 0]],
        'e': [[0, 1, 0], [1, 0, 0], [0, 0, 0]],
        'k': [[0, 1, 0], [0, 0, 0], [0, 0, 1]],
        'a': [[1, 1, 0], [0, 0, 0], [0, 0, 0]],
        'i': [[0, 1, 0], [0, 0, 0], [0, 1, 0]],
        'n': [[1, 0, 0], [0, 0, 0], [0, 0, 1]],
    },
    3: {
        'c': [[1, 0, 1], [0, 0, 0], [0, 0, 1]],
        'e': [[0, 1, 0], [1, 0, 1], [0, 0, 0]],
        'k': [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
        'a': [[1, 1, 0], [1, 0, 0], [0, 0, 0]],
        'i': [[1, 0, 0], [1, 0, 0], [1, 0, 0]],
        'n': [[1, 0, 1], [1, 0, 0], [0, 0, 0]],
        'y': [[1, 0, 1], [0, 0, 0], [0, 1, 0]],
        'q': [[1, 0, 0], [1, 0, 0], [0, 0, 1]],
        'j': [[0, 0, 1], [0, 0, 1], [0, 1, 0]],
        'r': [[0, 1, 1], [0, 0, 0], [0, 1, 0]],
    },
    4: {
        'c': [[1, 0, 1], [0, 0, 0], [1, 0, 1]],
        'e': [[0, 1, 0], [1, 0, 1], [0, 1, 0]],
        'k': [[0, 1, 1], [1, 0, 0], [0, 0, 1]],
        'a': [[1, 0, 0], [1, 0, 0], [1, 1, 0]],
        'i': [[1, 0, 1], [1, 0, 1], [0, 0, 0]],
        'n': [[1, 0, 0], [1, 0, 0], [1, 0, 1]],
        'y': [[1, 0, 1], [0, 0, 0], [1, 1, 0]],
        'q': [[1, 1, 0], [1, 0, 0], [0, 0, 1]],
        'j': [[0, 0, 1], [1, 0, 1], [0, 1, 0]],
        'r': [[0, 1, 1], [0, 0, 1], [0, 1, 0]],
        't': [[1, 1, 1], [0, 0, 0], [0, 1, 0]],
        'w': [[1, 0, 0], [1, 0, 0], [0, 1, 1]],
        'z': [[1, 1, 0], [0, 0, 0], [0, 1, 1]],
    },
    5: {
        'c': [[0, 1, 0], [1, 0, 1], [1, 1, 0]],
        'e': [[1, 0, 1], [0, 0, 0], [1, 1, 1]],
        'k': [[1, 0, 1], [0, 0, 1], [1, 1, 0]],
        'a': [[0, 0, 1], [0, 0, 1], [1, 1, 1]],
        'i': [[0, 1, 1], [0, 0, 1], [0, 1, 1]],
        'n': [[0, 1, 0], [0, 0, 1], [1, 1, 1]],
        'y': [[0, 1, 0], [1, 0, 1], [1, 0, 1]],
        'q': [[0, 1, 1], [0, 0, 1], [1, 1, 0]],
        'j': [[1, 1, 0], [1, 0, 0], [1, 0, 1]],
        'r': [[1, 0, 0], [1, 0, 1], [1, 0, 1]],
    },
    6: {
        'c': [[0, 1, 0], [1, 0, 1], [1, 1, 1]],
        'e': [[1, 0, 1], [0, 0, 1], [1, 1, 1]],
        'k': [[1, 0, 1], [1, 0, 1], [1, 1, 0]],
        'a': [[0, 0, 1], [1, 0, 1], [1, 1, 1]],
        'i': [[1, 0, 1], [1, 0, 1], [1, 0, 1]],
        'n': [[0, 1, 1], [1, 0, 1], [1, 1, 0]],
    },
    7: {
        'c': [[0, 1, 1], [1, 0, 1], [1, 0, 1]],
        'e': [[1, 0, 1], [1, 0, 1], [1, 1, 1]],
    },
    8: {
        '': [[1, 1, 1], [1, 0, 1], [1, 1, 1]],
    },
};

function transitionGridToNumber(grid: TransitionGrid): number {
    return (grid[0][0] << 7) + (grid[0][1] << 6) + (grid[0][2] << 5) + (grid[1][0] << 4) + (grid[1][2] << 3) + (grid[2][0] << 2) + (grid[2][1] << 1) + grid[2][2];
}

let fullTransitions: {[key: number]: {[key: string]: Uint8Array}} = {};
for (let [number, letters] of Object.entries(TRANSITIONS)) {
    let outLetters: {[key: string]: Uint8Array} = {};
    for (let [letter, t] of Object.entries(letters)) {
        let allTransitions = new Set<number>();
        for (let j = 0; j < 5; j++) {
            t = [
                [t[2][0], t[1][0], t[0][0]],
                [t[2][1], t[1][1], t[0][1]],
                [t[2][2], t[1][2], t[0][2]],
            ];
            allTransitions.add(transitionGridToNumber(t));
            allTransitions.add(transitionGridToNumber([
                [t[0][2], t[0][1], t[0][0]],
                [t[1][2], t[1][1], t[1][0]],
                [t[2][2], t[2][1], t[2][0]],
            ]));
            allTransitions.add(transitionGridToNumber([
                [t[2][0], t[2][1], t[2][2]],
                [t[1][0], t[1][1], t[1][2]],
                [t[0][0], t[0][1], t[0][2]],
            ]));
        }
        outLetters[letter] = new Uint8Array(allTransitions);
    }
    fullTransitions[parseInt(number)] = outLetters;
}


type Rule = {n: number} & {[K in 'b' | 's']: {
    [0]: {[K in 'c']: boolean},
    [1]: {[K in 'c' | 'e']: boolean},
    [2]: {[K in 'c' | 'e' | 'k' | 'a' | 'i' | 'n']: boolean},
    [3]: {[K in 'c' | 'e' | 'k' | 'a' | 'i' | 'n' | 'y' | 'q' | 'j' | 'r']: boolean},
    [4]: {[K in 'c' | 'e' | 'k' | 'a' | 'i' | 'n' | 'y' | 'q' | 'j' | 'r' | 't' | 'w' | 'z']: boolean},
    [5]: {[K in 'c' | 'e' | 'k' | 'a' | 'i' | 'n' | 'y' | 'q' | 'j' | 'r']: boolean},
    [6]: {[K in 'c' | 'e' | 'k' | 'a' | 'i' | 'n']: boolean},
    [7]: {[K in 'c' | 'e']: boolean},
    [8]: {[K in 'c']: boolean},
}};

function createRule(): Rule {
    return {
        n: 0,
        b: {
            0: {c: false},
            1: {c: false, e: false},
            2: {c: false, e: false, k: false, a: false, i: false, n: false},
            3: {c: false, e: false, k: false, a: false, i: false, n: false, y: false, q: false, j: false, r: false},
            4: {c: false, e: false, k: false, a: false, i: false, n: false, y: false, q: false, j: false, r: false, t: false, w: false, z: false},
            5: {c: false, e: false, k: false, a: false, i: false, n: false, y: false, q: false, j: false, r: false},
            6: {c: false, e: false, k: false, a: false, i: false, n: false},
            7: {c: false, e: false},
            8: {c: false},
        },
        s: {
            0: {c: false},
            1: {c: false, e: false},
            2: {c: false, e: false, k: false, a: false, i: false, n: false},
            3: {c: false, e: false, k: false, a: false, i: false, n: false, y: false, q: false, j: false, r: false},
            4: {c: false, e: false, k: false, a: false, i: false, n: false, y: false, q: false, j: false, r: false, t: false, w: false, z: false},
            5: {c: false, e: false, k: false, a: false, i: false, n: false, y: false, q: false, j: false, r: false},
            6: {c: false, e: false, k: false, a: false, i: false, n: false},
            7: {c: false, e: false},
            8: {c: false},
        },
    };
}

const BITSTRINGS = [
    '0011',
    '0110',
    '0111',
    '1001',
    '1011',
    '1100',
    '1101',
    '1110',
    '1111',
];

function generateStartingRule(): Rule {
    let bitstring = BITSTRINGS[Math.floor(Math.random() * BITSTRINGS.length)];
    let rule = createRule();
    if (bitstring[0] === '1') {
        rule.n++;
        rule.b[2].c = true;
    }
    if (bitstring[1] === '1') {
        rule.n++;
        rule.b[2].e = true;
    }
    if (bitstring[2] === '1') {
        rule.n++;
        rule.b[3].i = true;
    }
    if (bitstring[3] === '1') {
        rule.n++;
        rule.b[3].a = true;
    }
    return rule;
}

const BAD = [['b', 0, 'c'], ['b', 1, 'c'], ['b', 1, 'e'], ['b', 2, 'a']];
const MAX = 102 - BAD.length;

function addTransition(rule: Rule): Rule {
    let n = rule.n + BAD.length;
    n += Math.floor(Math.random() * (MAX - n));
    rule.n++;
    for (let start of ['b', 's'] as const) {
        for (let num of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
            let section = rule[start][num];
            for (let letter in section) {
                if (!section[letter as keyof typeof section]) {
                    if (BAD.includes([start, num, letter])) {
                        continue;
                    }
                    n--;
                    if (n === 0) {
                        section[letter as keyof typeof section] = true;
                        return rule;
                    }
                }
            }
        }
    }
    return rule;
}


interface Table {
    b: Uint8Array;
    s: Uint8Array;
}

function _ruleToTable(rule: Rule['b']): Uint8Array {
    let out: number[] = [];
    for (let num of [0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
        let section = rule[num];
        for (let letter in section) {
            if (section[letter as keyof typeof section]) {
                out.push(...fullTransitions[num][letter]);
            }
        }
    }
    return new Uint8Array(out);
}

function ruleToTable(rule: Rule): Table {
    return {
        b: _ruleToTable(rule.b),
        s: _ruleToTable(rule.s),
    };
}

function get(p: Uint8Array, x: number, y: number): number {
    return p[y * SIZE + x];
}

function runGeneration(p: Uint8Array, rule: Table): Uint8Array {
    let sets: [number, number, number][] = [];
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let cell = get(p, x, y);
            let cells = transitionGridToNumber([
                // @ts-ignore
                [get(p, x - 1, y - 1) > 0, get(p, x, y - 1) > 0, get(p, x + 1, y - 1) > 0],
                // @ts-ignore
                [get(p, x - 1, y) > 0, 0, get(p, x + 1, y) > 0],
                // @ts-ignore
                [get(p, x - 1, y + 1) > 0, get(p, x, y + 1) > 0, get(p, x + 1, y + 1) > 0],
            ]);
            if (cell > 0) {
                if (!rule.s.includes(cells)) {
                    sets.push([x, y, 0]);
                }
            } else if (rule.b.includes(cells)) {
                sets.push([x, y, 1]);
            }
        }
    }
    for (let [x, y, value] of sets) {
        p[y * SIZE + x] = value;
    }
    return p;
}


function parseSingleNumINTTransitions(num: number, minus: boolean, trs: string): [number, string][] {
    let out: [number, string][] = [];
    if (trs.length === 0) {
        for (let char in TRANSITIONS[num]) {
            out.push([num, char]);
        }
    } else if (minus) {
        let outTrs = Object.keys(TRANSITIONS[num]).join('');
        for (let char of trs) {
            if (!outTrs.includes(char)) {
                throw new Error(`Invalid transition for ${num}: ${char}`);
            }
            outTrs = outTrs.replace(char, '');
        }
        for (let char of outTrs) {
            out.push([num, char]);
        }
    } else {
        for (let char of trs) {
            if (!(char in TRANSITIONS[num])) {
                throw new Error(`Invalid transition for ${num}: ${char}`);
            }
            out.push([num, char]);
        }
    }
    return out;
}

function parseINTTransitions(data: string): Uint8Array {
    let allTrs: [number, string][] = [];
    let num = parseInt(data[0]);
    let minus = false;
    let trs = '';
    for (let char of data.slice(1)) {
        if ('012345678'.includes(char)) {
            allTrs.push(...parseSingleNumINTTransitions(num, minus, trs));
            num = parseInt(char);
            minus = false;
            trs = '';
        } else if (char === '-') {
            minus = true;
        } else {
            trs += char;
        }
    }
    allTrs.push(...parseSingleNumINTTransitions(num, minus, trs));
    let out: number[] = [];
    for (let [num, char] of allTrs) {
        out.push(...fullTransitions[num][char]);
    }
    return new Uint8Array(out);
}

function parseRule(rule: string): Table {
    let [b, s] = rule.split('/').map(x => x.slice(1));
    return {
        b: parseINTTransitions(b),
        s: parseINTTransitions(s),
    };
}


function _ruleToString(rule: Rule['b']): string {
    return Object.entries(rule).map(x => x[0] + Object.entries(x[1]).map(y => y[1] ? y[0] : '').join('')).join('');
}

function ruleToString(rule: Rule): string {
    return 'B' + _ruleToString(rule.b) + '/S' + _ruleToString(rule.s);
}

function randomPattern(x: number, y: number): Uint8Array {
    let out = new Uint8Array(SIZE * SIZE);
    for (let row = 0; row < y; row++) {
        for (let col = 0; col < x; col++) {
            out[(SIZE / 2 + row) * SIZE + (SIZE / 2 + col)] = Math.round(Math.random());
        }
    }
    return out;
}

function most<T>(data: T[], func: (x: T, i: number) => boolean): boolean {
    return data.reduce((x, y, i) => x + (func(y, i) ? 1 : 0), 0) / data.length > 0.75;
}

function getDiffs(data: number[]): number[] {
    return Array.from({length: data.length}, (_, i) => data[i + 1] - data[i]);
}

function getExplosivity(rule: Table): [number, number, number] {
    let stables = 0;
    let linears = 0;
    let quadratics = 0;
    for (let i = 0; i < SOUPS; i++) {
        let pattern = randomPattern(SOUSIZE, SOUSIZE);
        for (let i = 0; i < START; i++) {
            runGeneration(pattern, rule);
        }
        let pops: number[] = [pattern.reduce((x, y) => x + y)];
        for (let i = 0; i < Math.floor(GENS / SEGMENTS); i++) {
            for (let j = 0; j < SEGMENTS; j++) {
                pattern = runGeneration(pattern, rule);
            }
            pops.push(pattern.reduce((x, y) => x + y));
        }
        let fods = getDiffs(pops);
        let sods = getDiffs(fods);
        if (most(sods, x => x < 10)) {
            if (!most(fods, x => x < 10)) {
                linears++;
            } else {
                stables++;
            }
        } else {
            quadratics++;
        }
        console.log(i + 1, 'soups completed');
    }
    return [stables / SOUPS, linears / SOUPS, quadratics / SOUPS];
}

function run(str: string, table: Table): void {
    let [stables, linears, quadratics] = getExplosivity(table);
    let kind: string;
    if (quadratics > 0.5) {
        kind = 'explosive';
    } else if (linears > 0.1) {
        kind = 'semi-explosive';
    } else {
        kind = 'chaotic';
    }
    console.log(str + ': ' + kind + ' (' + Math.round(stables * 100) + '% stable, ' + Math.round(linears * 100) + '% linear growth, ' + Math.round(quadratics * 100) + '% quadratic growth)');
}

if (process.argv[2]?.startsWith('B')) {
    let rule = process.argv[2];
    run(rule, parseRule(rule));
} else {
    let rule = generateStartingRule();
    while (rule.n < MAX) {
        run(ruleToString(rule), ruleToTable(rule));
        rule = addTransition(rule);
    }
}
