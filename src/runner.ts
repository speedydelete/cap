
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
    b: Uint8Array;
    s: Uint8Array;
    c: number;
    n: Neighborhood;
    r: number;
}

type Rule = OTRule | INTRule;


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


let ruleCache = new Map<string, Rule>();

function splitDigitString(str: string): number[] {
    return Array.from(str, x => parseInt(x));
}

function parseSingleNumINTTransitions(num: number, minus: boolean, trs: string, token: Token): [number, string][] {
    let out: [number, string][] = [];
    if (trs.length === 0) {
        for (let char in TRANSITIONS[num]) {
            out.push([num, char]);
        }
    } else if (minus) {
        let outTrs = Object.keys(TRANSITIONS[num]).join('');
        for (let char of trs) {
            if (!outTrs.includes(char)) {
                error(`Invalid isotropic transition for ${num}: ${char}`, token);
            }
            outTrs = outTrs.replace(char, '');
        }
        for (let char of outTrs) {
            out.push([num, char]);
        }
    } else {
        for (let char of trs) {
            if (!(char in TRANSITIONS[num])) {
                error(`Invalid isotropic transition for ${num}: ${char}`, token);
            }
            out.push([num, char]);
        }
    }
    return out;
}

function parseINTTransitions(data: string, token: Token): Uint8Array {
    let allTrs: [number, string][] = [];
    let num = parseInt(data[0]);
    let minus = false;
    let trs = '';
    for (let char of data.slice(1)) {
        if ('012345678'.includes(char)) {
            allTrs.push(...parseSingleNumINTTransitions(num, minus, trs, token));
            num = parseInt(char);
            minus = false;
            trs = '';
        } else if (char === '-') {
            minus = true;
        } else {
            trs += char;
        }
    }
    allTrs.push(...parseSingleNumINTTransitions(num, minus, trs, token));
    let out: number[] = [];
    for (let [num, char] of allTrs) {
        out.push(...fullTransitions[num][char]);
    }
    return new Uint8Array(out);
}

function parseHROTTransitions(part: string, rule: string, token: Token): number[] {
    let out: number[] = [];
    if (part.includes('-') || part.includes('..')) {
        let sections = part.split(/-|../);
        if (sections.length !== 2) {
            error(`Invalid HROT rule (more than 1 - or .. in a section): '${rule}'`, token);
        }
        let [start, end] = part.split('-');
        for (let i = parseInt(start); i <= parseInt(end); i++) {
            out.push(i);
        }
    } else {
        out.push(parseInt(part));
    }
    return out;
}

function parseRule(token: Token<'rule'>): Rule {
    let rule = token.rule;
    let cached = ruleCache.get(rule);
    if (cached !== undefined) {
        return cached;
    }
    let match: RegExpMatchArray | null;
    if (rule.startsWith('B')) {
        if (match = rule.match(/^B(\d*)\/S(\d*)$(?:\/C?(\d+))?$/)) {
            return {
                type: 'ot',
                b: splitDigitString(match[1]),
                s: splitDigitString(match[2]),
                c: match[3] ? parseInt(match[3]) : 2,
                n: 'moore',
                r: 1,
            };
        } else if (match = rule.match(/^B((?:\d-?[cekainyqjrtwz]*)*)\/S((?:\d-?[cekainyqjrtwz]*)*)(?:\/C?(\d+))?$/)) {
            return {
                type: 'int',
                b: parseINTTransitions(match[1], token),
                s: parseINTTransitions(match[2], token),
                c: match[3] ? parseInt(match[3]) : 2,
                n: 'moore',
                r: 1,
            }
        } else {
            error(`Invalid basic rule: ${rule}`, token);
        }
    } else if ('012345678/'.includes(rule[0])) {
        if (match = rule.match(/^(\d*)\/(\d*)(?:\/(\d+))?$/)) {
            return {
                type: 'ot',
                b: splitDigitString(match[2]),
                s: splitDigitString(match[1]),
                c: match[3] ? parseInt(match[3]) : 2,
                n: 'moore',
                r: 1,
            };
        } else if (match = rule.match(/^((?:\d-?[cekainyqjrtwz]*)*)\/((?:\d-?[cekainyqjrtwz]*)*)(?:\/(\d+))?$/)) {
            return {
                type: 'int',
                b: parseINTTransitions(rule[2], token),
                s: parseINTTransitions(rule[1], token),
                c: match[3] ? parseInt(match[3]) : 2,
                n: 'moore',
                r: 1,
            };
        } else {
            error(`Invalid Generations rule: ${rule}`, token);
        }
    } else if (rule.startsWith('R')) {
        let parts = rule.split(',');
        let r = 1;
        let c = 2;
        let m = 0;
        let s: number[] = [];
        let b: number[] = [];
        let n: Neighborhood = 'moore';
        for (let i = 0; i < parts.length; i++) {
            let part = parts[i];
            if (part.startsWith('R')) {
                r = parseInt(part.slice(1));
            } else if (part.startsWith('C')) {
                c = parseInt(part.slice(1));
            } else if (part.startsWith('M')) {
                m = parseInt(part.slice(1));
            } else if (part.startsWith('S') || part.startsWith('B')) {
                let list: number[] = [];
                let firstChar = part[0];
                part = part.slice(1);
                if (part.length !== 0) {
                    if (!'0123456789'.includes(part[0])) {
                        error(`Invalid HROT rule (character after S or B must be a digit or a comma): '${rule}'`, token);
                    }
                    list.push(...parseHROTTransitions(part, rule, token));
                }
                while (i < parts.length) {
                    let part = parts[++i];
                    if (part === undefined || !'0123456789'.includes(part[0])) {
                        break;
                    }
                    list.push(...parseHROTTransitions(part, rule, token));
                }
                i--;
                if (firstChar === 'S') {
                    s = list;
                } else {
                    b = list;
                }
            } else {
                error(`Invalid HROT rule (cannot parse section): '${rule}'`, token);
            }
        }
        if (m !== 0) {
            if (m !== 1) {
                error(`Invalid HROT rule (M is not 0 or 1): '${rule}'`, token);
            }
            s = s.map(x => x + 1);
            b = b.map(x => x + 1);
        }
        return {type: 'ot', r, c, s, b, n};
    } else if (rule.startsWith('b')) {
        if (match = rule.match(/^b(\d+)s(\d+)$/)) {
            return {
                type: 'ot',
                b: splitDigitString(match[1]),
                s: splitDigitString(match[2]),
                c: 2,
                n: 'moore',
                r: 1,
            };
        } else {
        error(`Invalid apgsearch outer-totalistic rule: ${rule}`, token);
        }
    } else if (rule.startsWith('g')) {
        if (match = rule.match(/^g(\d+)b(\d+)s(\d+)$/)) {
            return {
                type: 'ot',
                b: splitDigitString(match[2]),
                s: splitDigitString(match[3]),
                c: parseInt(match[1]),
                n: 'moore',
                r: 1,
            }
        } else {
        error(`Invalid apgsearch Generations rule: ${rule}`, token);
        }
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
                let cells = transitionGridToNumber([
                    // @ts-ignore
                    [p.get(x - 1, y - 1) > 0, p.get(x, y - 1) > 0, p.get(x + 1, y - 1) > 0],
                    // @ts-ignore
                    [p.get(x - 1, y) > 0, 0, p.get(x + 1, y) > 0],
                    // @ts-ignore
                    [p.get(x - 1, y + 1) > 0, p.get(x, y + 1) > 0, p.get(x + 1, y + 1) > 0],
                ]);
                if (cell > 0) {
                    if (!rule.s.includes(cells)) {
                        sets.push([x, y, (cell + 1) % rule.c]);
                    }
                } else if (rule.b.includes(cells)) {
                    sets.push([x, y, 1]);
                }
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
            p.offsetBy(westCols, northRows);
        }
        if (southRows > 0 || eastCols > 0) {
            p.resize(p.height + southRows, p.width + eastCols);
        }
    }
    return p;
}

export function runPattern(p: Pattern, generations: number, ruleToken: Token<'rule'>): Pattern {
    if (p.height === 0 || p.width === 0) {
        return p;
    }
    let rule = parseRule(ruleToken);
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
            if (p.data.some(row => row[i] !== 0) && xOffset < rule.r - i) {
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
