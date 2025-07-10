
import * as fs from 'node:fs/promises';
import * as path from 'node:path';


let homeDir = process.env.HOME;

let rawFiles: {[key: string]: string[]} = {};


type TokenType = '\n' | 'rle' | 'apgcode' | 'number' | 'transform' | 'variable' | '=' | '{' | '}' | '[' | ']' | '(' | ')' | ',';

interface Token {
    type: TokenType;
    value: string;
    stack: {
        file: string;
        line: number;
        col: number;
    }[];
}

function token(type: TokenType, value: string, file: string, line: number, col: number): Token {
    return {type, value, stack: [{file, line, col}]};
}

function error(msg: string, {value, stack}: Token): never;
function error(msg: string, value: string, file: string, line: number, col: number): never;
function error(msg: string, value: string | Token, file?: string, line?: number, col?: number): never {
    let actualStack: Token['stack'];
    if (typeof value === 'object') {
        actualStack = value.stack;
        value = value.value;
    } else {
        // @ts-ignore
        actualStack = [{file, line, col}];
    }
    for (let {file, line, col} of actualStack) {
        let filename = file;
        if (homeDir && filename.startsWith(homeDir)) {
            filename = '~' + filename.slice(homeDir.length);
        }
        msg += `\n    at ${filename}:${line + 1}:${col + 1}`;
        if (file in rawFiles) {
            msg += `\n        ${rawFiles[file][line]}`;
            msg += '\n        ' + ' '.repeat(col) + '^'.repeat(value.length) + ' (here)';
        }
    }
    console.log(msg);
    process.exit(1);
}

const ERROR_TOKEN_TYPES: {[K in TokenType]: string} = {
    '\n': 'newline',
    'rle': 'RLE',
    'apgcode': 'apgcode',
    'number': 'number',
    'transform': 'transformation',
    'variable': 'variable',
    '=': 'equals sign',
    '{': 'opening brace',
    '}': 'closing brace',
    '[': 'opening bracket',
    ']': 'closing bracket',
    '(': 'opening parentheses',
    ')': 'closing parentheses',
    ',': 'comma',
};

function assertTokenType<T extends TokenType>(token: Token, type: T): void {
    if (token.type !== type) {
        error(`SyntaxError: Expected ${ERROR_TOKEN_TYPES[type]}, got ${ERROR_TOKEN_TYPES[token.type]}`, token);
    }
}

const WORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$!';

function wordToken(word: string, file: string, line: number, col: number): Token {
    let type: Token['type'];
    if (word.endsWith('!')) {
        type = 'rle';
    } else if (word.match(/^(x[spq]|yl)\d+_/)) {
        type = 'apgcode';
    } else if (word.match(/^-?(\d+|0b[01]+|0o[0-7]+|0x[0-9A-Fa-f]+)$/)) {
        type = 'number';
    } else if (word.match(/^[A-Z]*$/)) {
        type = 'transform';
    } else if (word.match(/^[a-z_][a-z0-9_]*$/)) {
        type = 'variable';
    } else {
        error(`SyntaxError: Invalid word: '${word}'`, word, file, line, col);
    }
    return token(type, word, file, line, col);
}

async function tokenize<T extends boolean>(file: string, requireRule: T): Promise<{tokens: Token[]} & (T extends true ? {rule: string} : {rule?: string})> {
    let lines = (await fs.readFile(file)).toString().replaceAll('\r', '').split('\n');
    rawFiles[file] = lines;
    let out: Token[] = [];
    let rule: string | undefined = undefined;
    let match: RegExpExecArray | null;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (match = /(?<!:)\/\/.*/.exec(line)) {
            line = line.slice(0, match.index);
        }
        if (line.length === 0) {
            continue;
        } else if (line.startsWith('rule ')) {
            rule = line.slice('rule '.length);
            continue;
        } else if (line.startsWith('include ') || line.startsWith('includestd ')) {
            let lib: string;
            if (line.startsWith('include ')) {
                lib = path.join(path.dirname(file), line.slice('include '.length));
            } else {
                lib = path.join(import.meta.dirname, '../stdlib', line.slice('includestd '.length));
            }
            let tokenized = await tokenize(lib, false);
            if (tokenized.rule !== undefined) {
                rule = tokenized.rule;
            }
            out.push(...tokenized.tokens);
            continue;
        } else if (line.startsWith('import ')) {
            let items = line.split(' ');
            if (items.length < 4 || items[2] !== 'from') {
                error('SyntaxError: Invalid import statement', line, file, i, 0);
            }
            let url = items.slice(3).join(' ');
            let response = await fetch(url);
            if (!response.ok) {
                error(`HTTPError: ${response.status} ${response.statusText} while fetching importurl`, url, file, i, items.slice(0, 2).join(' ').length + 1);
            }
            let data = (await response.text()).split('\n');
            let index = data.findIndex(line => !line.startsWith('#') && !line.startsWith('x'));
            let rle = data.slice(index).join('');
            out.push(
                token('variable', items[1], file, index, 'importurl '.length),
                token('=', '=', file, i, 0),
                token('rle', rle, url, index, 0),
                token('\n', '\n', file, i, line.length),
            );
            continue;
        }
        let word = '';
        let parsingWord = false;
        let col = 0;
        let wordStartCol = 0;
        for (let char of line) {
            if (parsingWord && WORD_CHARS.includes(char)) {
                word += char;
            } else {
                if (parsingWord) {
                    out.push(wordToken(word, file, i, wordStartCol));
                    word = '';
                    parsingWord = false;
                }
                if (char === ' ' || char === '\t') {
                    col++;
                    continue;
                } else if (WORD_CHARS.includes(char)) {
                    parsingWord = true;
                    word = char;
                    wordStartCol = col;
                } else if (char === '=' || char === '{' || char == '}' || char === '[' || char === ']' || char === '(' || char === ')' || char === ',') {
                    out.push(token(char, char, file, i, col));
                } else {
                    error(`SyntaxError: Unrecognized character: '${char}'`, char, file, i, col);
                }
            }
            col++;
        }
        if (parsingWord) {
            out.push(wordToken(word, file, i, wordStartCol));
        }
        out.push(token('\n', '\n', file, i, line.length + 1));
    }
    if (requireRule) {
        if (rule === undefined) {
            console.log('SyntaxError: Patterns must have a rule');
            process.exit(1);
        }
    }
    // @ts-ignore
    return {tokens: out, rule};
}

const CLOSING_PARENS: {[key: string]: string} = {
    '{': '}',
    '[': ']',
    '(': ')',
};

function splitByNewlines(tokens: Token[]): Token[][] {
    if (tokens.length === 0) {
        return [];
    }
    let out: Token[][] = [];
    let line: Token[] = [];
    let parenStack: Token[] = [];
    for (let token of tokens) {
        if (token.type === '\n' && parenStack.length === 0) {
            out.push(line);
            line = [];
            continue;
        } else if (token.type === '{' || token.type === '[' || token.type === '(') {
            parenStack.push(token);
        } else if (token.type === '}' || token.type === ']' || token.type === ')') {
            let other = parenStack.pop();
            if (!other || CLOSING_PARENS[other.type] !== token.type) {
                error(`SyntaxError: Unmatched ${ERROR_TOKEN_TYPES[token.type]}`, token);
            }
        }
        line.push(token);
    }
    if (parenStack.length > 0) {
        let token = parenStack[parenStack.length - 1];
        error(`SyntaxError: Unmatched ${ERROR_TOKEN_TYPES[token.type]}`, token);
    }
    out.push(line);
    return out;
}

class Scope {

    parent: Scope | null;
    vars: Map<string, Token[]>;

    constructor(parent: Scope | null = null) {
        this.parent = parent;
        this.vars = new Map();
    }

    get(token: Token, force: boolean = true): Token[] {
        let value = this.vars.get(token.value);
        if (value !== undefined) {
            let out = structuredClone(value);
            out.forEach(x => x.stack.push(...token.stack));
            return out;
        } else if (this.parent) {
            return this.parent.get(token);
        } else if (!force) {
            return [token];
        } else {
            error(`ReferenceError: ${token.value} is not defined`, token);
        }
    }

    set(name: string, value: Token[]): void {
        this.vars.set(name, value);
    }

}

function combinations(sections: (Token | Token[])[]): Token[][] {
    let prefix: Token[] = [];
    for (let i = 0; i < sections.length; i++) {
        let section = sections[i];
        if (Array.isArray(section)) {
            let lines: Token[][] = [];
            for (let line of splitByNewlines(section)) {
                if (line.length === 0) {
                    continue;
                }
                lines.push(...combinations((prefix as (Token | Token[])[]).concat(line, sections.slice(i + 1))));
            }
            return lines;
        } else {
            prefix.push(section);
        }
    }
    return [prefix];
}

function replaceVariablesSimple(tokens: Token[], scope: Scope, force: boolean = true): Token[] {
    let out: Token[] = [];
    for (let token of tokens) {
        if (token.type === 'variable') {
            out.push(...scope.get(token, force));
        } else {
            out.push(token);
        }
    }
    return out;
}

function replaceVariables(tokens: Token[], scope: Scope = new Scope()): Token[] {
    let out: Token[] = [];
    for (let line of splitByNewlines(tokens)) {
        if (line.length === 0) {
            continue;
        } else if (line.length >= 2 && line[1].type === '=') {
            assertTokenType(line[0], 'variable');
            scope.set(line[0].value, line.slice(2));
        } else {
            line = replaceVariablesSimple(line, scope, false);
            let sections: (Token | Token[])[] = [];
            for (let i = 0; i < line.length; i++) {
                let token = line[i];
                if (token.type === '{') {
                    let braceCount = 1;
                    let section: Token[] = [];
                    while (braceCount > 0) {
                        let token = line[++i];
                        section.push(token);
                        if (token.type === '{') {
                            braceCount++;
                        } else if (token.type === '}') {
                            braceCount--;
                        }
                    }
                    section.pop();
                    if (section[0].type === '(') {
                        section.shift();
                        let args: string[] = [];
                        let wasComma = true;
                        let j = 0;
                        for (; j < section.length; j++) {
                            let token = section[j];
                            if (token.type === ')') {
                                break;
                            } else if (wasComma) {
                                assertTokenType(token, 'variable');
                                args.push(token.value);
                                wasComma = false;
                            } else {
                                assertTokenType(token, ',');
                                wasComma = true;
                            }
                        }
                        section = section.slice(j + 1);
                        let parenToken = line[++i];
                        if (parenToken.type !== '(') {
                            error('SyntaxError: Expected left parentheses', parenToken);
                        }
                        let argInputs: Token[][] = [];
                        let currentArgInput: Token[] = [];
                        let parenCount = 1;
                        while (i < line.length) {
                            let token = line[++i];
                            if (token.type === ')' || token.type === ']' || token.type === '}') {
                                parenCount--;
                                if (parenCount === 0) {
                                    break;
                                }
                            } else if (token.type === '(' || token.type === '[' || token.type === '{') {
                                parenCount++;
                            } else if (token.type === ',') {
                                argInputs.push(currentArgInput);
                                currentArgInput = [];
                                continue;
                            }
                            currentArgInput.push(token);
                        }
                        if (currentArgInput.length > 0) {
                            argInputs.push(currentArgInput);
                        }
                        if (args.length !== argInputs.length) {
                            error(`TypeError: Function takes ${args.length} argument${args.length === 1 ? '' : 's'} but ${argInputs.length} argument${argInputs.length === 1 ? ' was' : 's were'} provided`, parenToken);
                        }
                        let funcScope = new Scope(scope);
                        for (let i = 0; i < args.length; i++) {
                            funcScope.set(args[i], argInputs[i]);
                        }
                        sections.push(replaceVariablesSimple(section, funcScope, false));
                    } else {
                        sections.push(section);
                    }
                } else {
                    sections.push(token);
                }
            }
            for (let line of combinations(sections)) {
                out.push(...replaceVariablesSimple(line, scope));
                out.push({type: '\n', value: '\n', stack: structuredClone(line[0].stack)});
            }
        }
    }
    return out;
}


function rleToGrid(token: Token): [number[][], number] {
    let out: number[][] = [];
    let row: number[] = [];
    let num = '';
    for (let char of token.value) {
        if ('0123456789'.includes(char)) {
            num += char;
        } else if (char === 'o' || char === 'b') {
            let run = num === '' ? 1 : parseInt(num);
            let value = char === 'o' ? 1 : 0;
            for (let i = 0; i < run; i++) {
                row.push(value);
            }
            num = '';
        } else if (char === '$') {
            out.push(row);
            if (num !== '') {
                let run = parseInt(num);
                for (let i = 1; i < run; i++) {
                    out.push([]);
                }
            }
            row = [];
            num = '';
        } else if (char === '!') {
            out.push(row);
        } else {
            error(`SyntaxError: Invalid RLE character: '${char}'`, token);
        }
    }
    let width = Math.max(...out.map(x => x.length));
    for (let row of out) {
        while (row.length < width) {
            row.push(0);
        }
    }
    return [out, width];
}

const APGCODE_CHARS = Object.fromEntries(Array.from('0123456789abcdefghijklmnopqrstuv', (char, i) => [char, Array.from(i.toString(2).padEnd(5, '0')).map(x => parseInt(x))]));
const ZERO_STRIP = [0, 0, 0, 0, 0];

let apgcodeCache = new Map<string, [number[][], number]>();

function apgcodeToGrid(token: Token): [number[][], number] {
    let data = token.value.slice(token.value.lastIndexOf('_') + 1);
    let cached = apgcodeCache.get(data);
    if (cached !== undefined) {
        return cached;
    }
    let out: number[][] = [];
    for (let strip of data.split(' ')) {
        let transposed: number[][] = [];
        for (let i = 0; i < strip.length; i++) {
            let char = strip[i];
            if (char in APGCODE_CHARS) {
                transposed.push(APGCODE_CHARS[char]);
            } else if (char === 'w') {
                transposed.push(ZERO_STRIP, ZERO_STRIP);
            } else if (char === 'x') {
                transposed.push(ZERO_STRIP, ZERO_STRIP, ZERO_STRIP);
            } else if (char === 'y') {
                let strNum = strip[++i];
                if (!'0123456789'.includes(strNum)) {
                    error(`SyntaxError: Invalid character after 'y' in apgcode: ${strNum}`, token);
                }
                if ('0123456789'.includes(strip[i + 1])) {
                    strNum += strip[++i];
                }
                let num = parseInt(strNum);
                for (let i = 0; i < num; i++) {
                    transposed.push(ZERO_STRIP);
                }
            }
        }
        for (let y = 0; y < 5; y++) {
            let row: number[] = [];
            for (let x = 0; x < transposed.length; x++) {
                row.push(transposed[x][y]);
            }
            out.push(row);
        }
    }
    let width = Math.max(...out.map(x => x.length));
    for (let row of out) {
        for (let i = row.length; i < width; i++) {
            row.push(0);
        }
    }
    out = out.filter(x => !x.every(y => y === 0));
    while (out.every(x => x[0] === 0)) {
        out = out.map(x => x.slice(1));
        width--;
    }
    while (out.every(x => x[x.length - 1] === 0)) {
        out = out.map(x => x.slice(0, -1));
        width--;
    }
    out = out.filter(x => x.length > 0);
    apgcodeCache.set(data, [out, width]);
    return [out, width];
}

function transpose(pattern: number[][], width: number): [number[][], number] {
    let out: number[][] = Array.from({length: width}, () => (new Array(pattern.length)).fill(0));
    for (let y = 0; y < pattern.length; y++) {
        for (let x = 0; x < width; x++) {
            out[x][y] = pattern[y][x];
        }
    }
    return [out, pattern.length];
}

function tokensToGrid(data: Token[]): [number[][], number] {
    let lines = splitByNewlines(data);
    let patterns: [number, number, number[][], number][] = [];
    for (let line of lines) {
        if (line.length === 0) {
            continue;
        }
        let pattern: number[][];
        let width: number;
        if (line[0].type === 'rle') {
            [pattern, width] = rleToGrid(line[0]);
        } else if (line[0].type === '[') {
            let bracketCount = 1;
            let section: Token[] = [];
            let i = 1;
            let lastOpeningBracketToken = line[0];
            while (bracketCount > 0 && i < line.length) {
                let token = line[i++];
                if (token.type === '[') {
                    bracketCount++;
                    lastOpeningBracketToken = token;
                } else if (token.type === ']') {
                    bracketCount--;
                }
                section.push(token);
            }
            if (bracketCount > 0) {
                error('SyntaxError: Unmatched opening bracket', lastOpeningBracketToken);
            }
            section.pop();
            [pattern, width] = tokensToGrid(section);
        } else if (line[0].type === 'apgcode') {
            [pattern, width] = apgcodeToGrid(line[0]);
        } else {
            error(`SyntaxError: Expected RLE, left bracket, or apgcode, got ${ERROR_TOKEN_TYPES[line[0].type]}`, line[0]);
        }
        let shiftX = 0;
        let shiftY = 0;
        let expectY = false;
        for (let token of line.slice(1)) {
            if (token.type === 'number') {
                let num = parseInt(token.value);
                if (expectY) {
                    shiftY += num;
                    expectY = false;
                } else {
                    shiftX += num;
                    expectY = true;
                }
            } else if (expectY) {
                assertTokenType(token, 'number');
            } else if (token.type === 'transform') {
                for (let char of token.value) {
                    if (char === 'R') {
                        [pattern, width] = transpose(pattern, width);
                        pattern = pattern.map(row => row.reverse());
                    } else if (char === 'L') {
                        [pattern, width] = transpose(pattern, width);
                        pattern = pattern.reverse();
                    } else if (char === 'B') {
                        pattern = pattern.map(row => row.reverse()).reverse();
                    } else if (char === 'X') {
                        pattern = pattern.reverse();
                    } else if (char === 'Y') {
                        pattern = pattern.map(row => row.reverse());
                    } else if (char === 'D') {
                        [pattern, width] = transpose(pattern, width);
                    } else if (char === 'A') {
                        pattern = pattern.map(row => row.reverse());
                        [pattern, width] = transpose(pattern, width);
                        pattern = pattern.map(row => row.reverse());
                    } else if (char === 'T') {
                        [pattern, width] = transpose(pattern, width);
                    } else if (char !== 'N') {
                        error('SyntaxError: Invalid transformation', token);
                    }
                }
            } else if (token.type === '\n') {
                continue;
            } else {
                error(`SyntaxError: Unexpected ${ERROR_TOKEN_TYPES[token.type]}`, token);
            }
        }
        if (expectY) {
            error('SyntaxError: Missing Y coordinate after X coordinate', data[data.length - 1]);
        }
        patterns.push([shiftX, shiftY, pattern, width]);
    }
    let grid: number[][] = [];
    let gridWidth = 0;
    let offsetX = -Math.min(...patterns.map(x => x[0]));
    let offsetY = -Math.min(...patterns.map(x => x[1]));
    for (let [shiftX, shiftY, pattern, width] of patterns) {
        shiftX += offsetX;
        shiftY += offsetY;
        if (shiftY + pattern.length >= grid.length) {
            for (let i = grid.length - 1; i < shiftY + pattern.length; i++) {
                grid.push((new Array(gridWidth)).fill(0));
            }
        }
        if (shiftX + width >= gridWidth) {
            for (let row of grid) {
                for (let i = gridWidth - 1; i < shiftX + width; i++) {
                    row.push(0);
                }
            }
            gridWidth = shiftX + width;
        }
        for (let y = 0; y < pattern.length; y++) {
            for (let x = 0; x < width; x++) {
                grid[y + shiftY][x + shiftX] = pattern[y][x];
            }
        }
    }
    return [grid, gridWidth];
}

function gridToRLE([grid, width]: [number[][], number], rule: string): string {
    let beforeRLE = '';
    for (let row of grid) {
        if (row !== undefined) {
            for (let item of row) {
                if (item) {
                    beforeRLE += 'o';
                } else {
                    beforeRLE += 'b';
                }
            }   
        }
        beforeRLE += '$';
    }
    beforeRLE = beforeRLE.split('$').map(x => x.replace(/b+$/, '')).join('$').replaceAll(/^\$+|\$+$/g, '');
    let out =  `x = ${width}, y = ${grid.length}, rule = ${rule}\n`;
    if (beforeRLE.length === 0) {
        return out + '!';
    }
    let runLength = 1;
    let runChar = beforeRLE[0];
    for (let char of beforeRLE.slice(1)) {
        if (runChar === char) {
            runLength++;
        } else {
            if (runLength === 1) {
                out += runChar;
            } else {
                out += runLength + runChar;
            }
            runChar = char;
            runLength = 1;
        }
        if (out.lastIndexOf('\n') < -60) {
            out += '\n';
        }
    }
    if (runLength === 1) {
        out += runChar;
    } else {
        out += runLength + runChar;
    }
    return out + '!\n';
}


let rootPath = process.argv[2];
if (!path.isAbsolute(rootPath)) {
    rootPath = path.join(process.cwd(), rootPath);
}

let outPath = rootPath;
if (outPath.endsWith('.cap')) {
    outPath = outPath.slice(0, -4) + '.rle';
}

let {tokens, rule} = await tokenize(rootPath, true);
tokens = replaceVariables(tokens);
await fs.writeFile(outPath, gridToRLE(tokensToGrid(tokens), rule));
