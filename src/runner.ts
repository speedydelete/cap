
import {Token, error} from './tokenizer.js';
import {Pattern} from './pattern.js';


type Neighborhood = 'moore' | 'vonNeumann';

interface OTRule {
    type: 'ot';
    b: number[];
    s: number[];
    c: number;
    n: Neighborhood;
    r: number;
}

interface INTRule {
    type: 'int';
    b: [number, string][];
    s: number[];
    c: number;
    n: Neighborhood;
    r: number;
}

type Rule = OTRule | INTRule;


const BASIC_TRANSITIONS: {[key: number]: {[key: string]: number[][]}} = {
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

type TransitionTable = {[key: number]: {[key: string]: number[][][]}};

let cachedFullTransitions: null | TransitionTable = null;

function getFullTransitions(): TransitionTable {
    if (cachedFullTransitions) {
        return cachedFullTransitions;
    }
    let out: TransitionTable = {};
    for (let [number, letters] of Object.entries(BASIC_TRANSITIONS)) {
        let outLetters: {[key: string]: number[][][]} = {};
        for (let [letter, t] of Object.entries(letters)) {
            let allTransitions: number[][][] = [];
            for (let i = 0; i < 5; i++) {
                t = [
                    [t[2][0], t[1][0], t[0][0]],
                    [t[2][1], t[1][1], t[0][1]],
                    [t[2][2], t[1][2], t[0][2]],
                ];
                allTransitions.push(
                    t,
                    [
                        [t[0][2], t[0][1], t[0][0]],
                        [t[1][2], t[1][1], t[1][0]],
                        [t[2][2], t[2][1], t[2][0]],
                    ],
                    [
                        [t[2][0], t[2][1], t[2][2]],
                        [t[1][0], t[1][1], t[1][2]],
                        [t[0][0], t[0][1], t[0][2]],
                    ],
                );
            }
            let transitions: number[][][] = [];
            for (let t of allTransitions) {
                if (!transitions.some(x => x.every((y, i) => y.every((z, j) => z === t[i][j])))) {
                    transitions.push(t);
                }
            }
            outLetters[letter] = transitions;
        }
        out[parseInt(number)] = outLetters;
    }
    cachedFullTransitions = out;
    return out;
}


let ruleCache = new Map<string, Rule>();

function parseRule(rule: string, token: Token): Rule {
    let cached = ruleCache.get(rule);
    if (cached !== undefined) {
        return cached;
    }
    let match: RegExpMatchArray | null;
    if (match = rule.match(/B(\d+)\/S(\d+)$(?:\/C?(\d+))?/)) {
        return {
            type: 'ot',
            b: Array.from(match[1], x => parseInt(x)),
            s: Array.from(match[2], x => parseInt(x)),
            c: match[3] ? parseInt(match[3]) : 2,
            n: 'moore',
            r: 1,
        };
    } else if (match = rule.match(/^(\d+)\/(\d+)(?:\/(\d+s))?$/)) {
        return {
            type: 'ot',
            b: Array.from(match[2], x => parseInt(x)),
            s: Array.from(match[1], x => parseInt(x)),
            c: match[3] ? parseInt(match[3]) : 2,
            n: 'moore',
            r: 1,
        };
    } else {
        error(`Cannot parse rule: ${rule}`, token);
    }
}

function runGeneration(p: Pattern, rule: Rule): Pattern {
    let sets: [number, number, number][] = [];
    for (let y = 0; y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
            let cell = p.get(x, y);
            if (rule.type === 'ot') {
                let count = 0;
                for (let ax = -rule.r; ax <= rule.r; ax++) {
                    for (let ay = -rule.r; ay <= rule.r; ay++) {
                        if (ax === 0 && ay === 0) {
                            continue;
                        }
                        if (p.get(x + ax, y + ay) !== 0) {
                            count++;
                        }
                    }
                }
                if (cell > 0) {
                    if (!rule.s.includes(count)) {
                        sets.push([x, y, (cell + 1) % rule.c]);
                    }
                } else if (rule.b.includes(count)) {
                    sets.push([x, y, 1]);
                }
            } else {
                
            }
        }
    }
    if (rule.r === 1) {
        let northInc = false;
        let westInc = false;
        for (let [x, y, value] of sets) {
            p.set(x, y, value);
            if (value > 0) {
                if (x === 0) {
                    westInc = true;
                }
                if (x === p.width - 1) {
                    p.resize(p.height, p.width + 1);
                }
                if (y === 0) {
                    northInc = true;
                }
                if (y === p.height - 1) {
                    p.resize(p.height, p.width + 1);
                }
            }
        }
        if (northInc || westInc) {
            p.offsetBy(Number(westInc), Number(northInc));
        }
    } else {
        let northRows = 0;
        let southRows = 0;
        let westCols = 0;
        let eastCols = 0;
        for (let [x, y, value] of sets) {
            p.set(x, y, value);
            if (value > 0) {
                if (x < rule.r && westCols < x) {
                    westCols = x;
                }
                if (x >= p.width - rule.r && eastCols < p.width - x) {
                    eastCols = p.width - x;
                }
                if (y < rule.r && northRows < y) {
                    northRows = y;
                }
                if (y >= p.height - rule.r && southRows < p.width - x) {
                    southRows = p.width - x;
                }
            }
        }
        if (northRows > 0 || westCols > 0) {
            p.offsetBy(northRows, westCols);
        }
        if (southRows > 0 || eastCols > 0) {
            p.resize(southRows, eastCols);
        }
    }
    return p;
}

export function runPattern(p: Pattern, generations: number, ruleStr: string, token: Token): Pattern {
    if (p.height === 0 || p.width === 0) {
        return p;
    }
    let rule = parseRule(ruleStr, token);
    if (rule.r === 1) {
        p.resize(
            p.height + Number(p.data[p.data.length - 1].some(x => x !== 0)),
            p.width + Number(p.data.some(x => x[x.length - 1] !== 0)),
        );
        p.offsetBy(
            Number(p.data[0].some(x => x !== 0)),
            Number(p.data.some(x => x[0] !== 0)),
        );
    } else {
        let yOffset = 0;
        let xOffset = 0;
        let heightChange = 0;
        let widthChange = 0;
        for (let i = 0; i < rule.r; i++) {
            if (p.data[i].some(x => x !== 0) && yOffset < rule.r - i) {
                yOffset = rule.r - i;
            }
            if (p.data.some(row => row[i] !== 0) && yOffset < rule.r - i) {
                xOffset = rule.r - i;
            }
            if (p.data[p.height - i - 1].some(x => x !== 0) && heightChange < i + 1) {
                heightChange = i + 1;
            }
            if (p.data.some(row => row[p.width - i - 1] !== 0) && widthChange < i + 1) {
                widthChange = i + 1;
            }
        }
        if (heightChange || widthChange) {
            p.resize(p.height + heightChange, p.width + widthChange);
        }
        if (xOffset || yOffset) {
            p.offsetBy(xOffset, yOffset);
        }
    }
    for (let i = 0; i < generations; i++) {
        p = runGeneration(p, rule);
    }
    return p.resizeToFit();
}
