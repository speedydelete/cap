
import * as path from 'node:path';
import * as fs from 'node:fs/promises';


let rawFiles: {[key: string]: string[]} = {};

export function clearFileCache() {
    rawFiles = {};
}


export type TokenType = '\n' | 'rle' | 'apgcode' | 'number' | 'transform' | 'variable' | '=' | '{' | '}' | '[' | ']' | '(' | ')' | ',';

export interface Token {
    type: TokenType;
    value: string;
    stack: {
        file: string;
        line: number;
        col: number;
    }[];
}

export function createToken(type: TokenType, value: string, file: string, line: number, col: number): Token {
    return {type, value, stack: [{file, line, col}]};
}


let homeDir = process.env.HOME;

export function error(msg: string, {value, stack}: Token): never;
export function error(msg: string, value: string, file: string, line: number, col: number): never;
export function error(msg: string, value: string | Token, file?: string, line?: number, col?: number): never {
    let actualStack: Token['stack'];
    if (typeof value === 'object') {
        actualStack = value.stack.reverse();
        value = value.value;
    } else {
        // @ts-ignore
        actualStack = [{file, line, col}];
    }
    for (let i = 0; i < actualStack.length; i++) {
        let {file, line, col} = actualStack[i];
        let filename = file;
        if (homeDir && filename.startsWith(homeDir)) {
            filename = '~' + filename.slice(homeDir.length);
        }
        msg += `\n    at ${filename}:${line + 1}:${col + 1}`;
        if (file in rawFiles) {
            msg += `\n        ${rawFiles[file][line]}`;
            msg += '\n        ' + ' '.repeat(col) + (i === actualStack.length - 1 ? '^'.repeat(value.length) : '^') + ' (here)';
        }
    }
    console.log(msg);
    process.exit(1);
}

export const ERROR_TOKEN_TYPES: {[K in TokenType]: string} = {
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

export function assertTokenType<T extends TokenType>(token: Token, type: T): void {
    if (token.type !== type) {
        error(`SyntaxError: Expected ${ERROR_TOKEN_TYPES[type]}, got ${ERROR_TOKEN_TYPES[token.type]}`, token);
    }
}


const WORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$!';

function createWordToken(word: string, file: string, line: number, col: number): Token {
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
    return createToken(type, word, file, line, col);
}


export async function tokenize<T extends boolean>(file: string, requireRule: T): Promise<{tokens: Token[]} & (T extends true ? {rule: string} : {rule?: string})> {
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
                createToken('variable', items[1], file, index, 'importurl '.length),
                createToken('=', '=', file, i, 0),
                createToken('rle', rle, url, index, 0),
                createToken('\n', '\n', file, i, line.length),
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
                    out.push(createWordToken(word, file, i, wordStartCol));
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
                    out.push(createToken(char, char, file, i, col));
                } else {
                    error(`SyntaxError: Unrecognized character: '${char}'`, char, file, i, col);
                }
            }
            col++;
        }
        if (parsingWord) {
            out.push(createWordToken(word, file, i, wordStartCol));
        }
        out.push(createToken('\n', '\n', file, i, line.length + 1));
    }
    if (requireRule && rule === undefined) {
        rule = 'B3/S23';
    }
    // @ts-ignore
    return {tokens: out, rule};
}


const CLOSING_PARENS: {[key: string]: string} = {
    '{': '}',
    '[': ']',
    '(': ')',
};

export function splitByNewlines(tokens: Token[]): Token[][] {
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
