
import * as fs from 'node:fs/promises';
import * as path from 'node:path';


let rootPath = process.argv[2];
if (!path.isAbsolute(rootPath)) {
    rootPath = path.join(process.cwd(), rootPath);
}

let rawFiles: {[key: string]: string[]} = {};


type TokenType = '\n' | 'rle' | 'number' | 'transform' | 'variable' | '=' | '{' | '}' | '[' | ']';

interface Token {
    type: TokenType;
    value: string;
    file: string;
    line: number;
    col: number;
}

function createNewline(token: Token): Token {
    return {
        type: '\n',
        value: '\n',
        file: token.file,
        line: token.line,
        col: rawFiles[token.file][token.line].length,
    };
}

function error(msg: string, {value, file, line, col}: Token | Omit<Token, 'type'>): never {
    let out = msg;
    out += `\n    at ${file}:${line + 1}:${col + 1}`;
    out += `\n    ${rawFiles[file][line]}`;
    out += '\n    ' + ' '.repeat(col) + '^'.repeat(value.length) + ' (here)';
    console.log(out);
    process.exit(1);
}

const ERROR_TOKEN_TYPES: {[K in TokenType]: string} = {
    '\n': 'newline',
    'rle': 'RLE',
    'number': 'number',
    'transform': 'transformation',
    'variable': 'variable',
    '=': 'equals sign',
    '{': 'opening brace',
    '}': 'closing brace',
    '[': 'opening bracket',
    ']': 'closing bracket',
};

function assertTokenType<T extends TokenType>(token: Token, type: T): void {
    if (token.type !== type) {
        error(`Expected ${ERROR_TOKEN_TYPES[type]}, got ${ERROR_TOKEN_TYPES[token.type]}`, token);
    }
}

const WORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$!';

function addWordTokenType(token: Omit<Token, 'type'>, word: string): Token {
    let type: Token['type'];
    if (word.endsWith('!')) {
        type = 'rle';
    } else if (word.match(/^-?(\d+|0b[01]+|0o[0-7]+|0x[0-9A-Fa-f]+)$/)) {
        type = 'number';
    } else if (word.match(/^[A-Z]*$/)) {
        type = 'transform';
    } else if (word.match(/^[a-z_][a-z0-9_]+$/)) {
        type = 'variable';
    } else {
        error(`Invalid word: '${word}'`, token);
    }
    return Object.assign(token, {type});
}

async function tokenize<T extends boolean>(file: string, requireRule: T): Promise<{tokens: Token[]} & (T extends true ? {rule: string} : {rule?: string})> {
    let lines = (await fs.readFile(file)).toString().replaceAll('\r', '').split('\n');
    rawFiles[file] = lines;
    let out: Token[] = [];
    let rule: string | undefined = '';
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.includes('//')) {
            line = line.slice(0, line.indexOf('//'));
        }
        if (line.length === 0) {
            continue;
        } else if (line.startsWith('rule ')) {
            rule = line.slice('rule '.length);
            continue;
        } else if (line.startsWith('include ')) {
            let tokenized = await tokenize(path.join(path.dirname(file), line.slice('include '.length)), false);
            if (tokenized.rule !== undefined) {
                rule = tokenized.rule;
            }
            out.push(...tokenized.tokens);
            continue;
        }
        let word = '';
        let parsingWord = false;
        let col = 0;
        let wordStartCol = 0;
        for (let char of line) {
            if (parsingWord && WORD_CHARS.includes(char)) {
                word += char;
            } else if (parsingWord) {
                out.push(addWordTokenType({value: word, file, line: i, col: wordStartCol}, word));
                word = '';
                parsingWord = false;
            } else if (WORD_CHARS.includes(char)) {
                parsingWord = true;
                word = char;
                wordStartCol = col;
            } else if (char === '=' || char === '{' || char == '}' || char === '[' || char === ']') {
                out.push({type: char, value: char, file, line: i, col})
            } else if (char !== ' ' && char !== '\t') {
                error(`SyntaxError: Unrecognized character: '${char}'`, {value: char, file, line: i, col});
            }
            col++;
        }
        if (parsingWord) {
            out.push(addWordTokenType({value: word, file, line: i, col: wordStartCol}, word));
        }
        out.push(createNewline(out[out.length - 1]));
    }
    if (requireRule) {
        if (rule === undefined) {
            console.log('SyntaxError: Patterns must have a rule');
            process.exit(1);
        }
    }
    return {tokens: out, rule};
}


class Scope {

    parent: Scope | null;
    vars: Map<string, Token[]>;

    constructor(parent: Scope | null = null) {
        this.parent = parent;
        this.vars = new Map();
    }

    get(token: Token): Token[] {
        let value = this.vars.get(token.value);
        if (value !== undefined) {
            return value;
        } else if (this.parent) {
            return this.parent.get(token);
        } else {
            error(`ReferenceError: ${token.value} is not defined`, token);
        }
    }

    set(name: string, value: Token[]): void {
        this.vars.set(name, value);
    }

}

function splitByNewlines(tokens: Token[]): Token[][] {
    if (tokens.length === 0) {
        return [];
    }
    let out: Token[][] = [];
    let line: Token[] = [];
    let braceCount = 0;
    let lastOpeningBraceToken = tokens[0];
    for (let token of tokens) {
        if (token.type === '{') {
            braceCount++;
            lastOpeningBraceToken = token;
        } else if (token.type === '}') {
            braceCount--;
            if (braceCount < 0) {
                error('SyntaxError: Unmatched closing brace', token);
            }
        } else if (token.type === '\n' && braceCount === 0) {
            out.push(line);
            line = [];
            continue;
        }
        line.push(token);
    }
    if (braceCount > 0) {
        error('SyntaxError: Unmatched opening brace', lastOpeningBraceToken);
    }
    out.push(line);
    return out;
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

function replaceVariablesSimple(tokens: Token[], scope: Scope): Token[] {
    let out: Token[] = [];
    for (let token of tokens) {
        if (token.type === 'variable') {
            out.push(...scope.get(token));
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
            line = replaceVariablesSimple(line, scope);
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
                    sections.push(section.slice(0, -1));
                } else {
                    sections.push(token);
                }
            }
            for (let line of combinations(sections)) {
                out.push(...replaceVariablesSimple(line, scope));
                out.push(createNewline(line[0]));
            }
        }
    }
    return out;
}


function rleToArray(token: Token): [number[][], number] {
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
        } else if (char === '$') {
            out.push(row);
            row = [];
        } else if (char === '!') {
            out.push(row);
        } else {
            error(`Invalid RLE character: '${char}'`, token);
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

function transpose(pattern: number[][], width: number): [number[][], number] {
    let out: number[][] = Array.from({length: width}, () => (new Array(pattern.length)).fill(0));
    for (let y = 0; y < pattern.length; y++) {
        for (let x = 0; x < width; x++) {
            out[x][y] = pattern[y][x];
        }
    }
    return [out, pattern.length];
}

function generateRLE(data: Token[], rule: string): string {
    let lines = splitByNewlines(data);
    let patterns: [number, number, number[][], number][] = [];
    for (let line of lines) {
        if (line.length === 0) {
            continue;
        }
        assertTokenType(line[0], 'rle');
        let [pattern, width] = rleToArray(line[0]);
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
                    } else if (char === 'F') {
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
    let offsetY = -Math.min(...patterns.map(x => x[0]));
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
    let out =  `x = ${gridWidth}, y = ${grid.length}, rule = ${rule}\n`;
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


let outPath = rootPath;
if (outPath.endsWith('.cap')) {
    outPath = outPath.slice(0, -4) + '.rle';
}
let {tokens, rule} = await tokenize(rootPath, true);
tokens = replaceVariables(tokens);
await fs.writeFile(outPath, generateRLE(tokens, rule));
