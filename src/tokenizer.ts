
import {join, dirname} from 'node:path';
import * as fs from 'node:fs/promises';
import {existsSync as exists} from 'node:fs';


let rawFiles: {[key: string]: string[]} = {};

export function clearFileCache() {
    rawFiles = {};
}


export type Operator = '+' | '++' | '-' | '--' | '*' | '/' | '**' | '%' | '&' | '|' | '~' | '>>' | '>>>' | '<<' | '&&' | '||' | '!' | '==' | '!=' | '<' | '<=' | '>' | '>=';
export type Symbol = Operator | '=' | '{' | '}' | '[' | ']' | '(' | ')' | ',' | '@';
export type TokenType = '\n' | 'rle' | 'apgcode' | 'number' | 'transform' | 'variable' | 'rule' | 'keyword' | 'jsvalue' | Symbol;

export interface BaseToken<T extends TokenType = TokenType> {
    type: T;
    value: string;
    stack: {
        file: string;
        line: number;
        col: number;
    }[];
}

export type Keyword = 'true' | 'false' | 'let' | 'const' | 'export' | 'expand' | 'function' | 'return';

export type TokenTypeMap = {
    '\n': BaseToken<'\n'>;
    'rle': BaseToken<'rle'>;
    'apgcode': BaseToken<'apgcode'>;
    'number': BaseToken<'number'> & {numValue: number};
    'transform': BaseToken<'transform'>;
    'variable': BaseToken<'variable'>;
    'rule': BaseToken<'rule'> & {rule: string};
    'keyword': BaseToken<'keyword'> & {keyword: Keyword};
    'jsvalue': BaseToken<'jsvalue'> & {data: any};
} & {[K in Symbol]: BaseToken<K>};

export type Token<T extends TokenType = TokenType> = TokenTypeMap[T];

export function createToken<T extends TokenType>(type: T, value: string, file: string, line: number, col: number): Token<T> {
    let out: any = {type, value, stack: [{file, line, col}]};
    if (type === 'number') {
        out.numValue = parseInt(value);
    } else if (type === 'rule') {
        out.rule = value.slice('rule '.length);
    } else if (type === 'keyword') {
        out.keyword = value;
    }
    return out;
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
    'jsvalue': 'JavaScript value',
    '=': 'equals sign',
    '{': 'opening brace',
    '}': 'closing brace',
    '[': 'opening bracket',
    ']': 'closing bracket',
    '(': 'opening parentheses',
    ')': 'closing parentheses',
    ',': 'comma',
    '@': 'at sign',
    'rule': 'rule statement',
    'keyword': 'keyword',
    '+': 'plus sign',
    '++': 'double plus sign',
    '-': 'minus sign',
    '--': 'double minus sign',
    '*': 'asterisk',
    '/': 'slash',
    '**': 'double asterisk',
    '%': 'percent sign',
    '&': 'ampersand',
    '|': 'vertical bar',
    '~': 'tilde',
    '>>': 'double greater than sign',
    '>>>': 'triple greater than sign',
    '<<': 'double less than sign',
    '&&': 'double ampersand',
    '||': 'double vertical bar',
    '!': 'exclamation point',
    '==': 'double equals sign',
    '!=': 'not equals sign',
    '<': 'less than sign',
    '<=': 'less than or equal to sign',
    '>': 'greater than sign',
    '>=': 'greater than or equal to sign',
};

export function assertTokenType<T extends TokenType>(token: Token, type: T): asserts token is Token<T> {
    if (token?.type !== type) {
        error(`SyntaxError: Expected ${ERROR_TOKEN_TYPES[type]}, got ${token === undefined ? 'nothing' : ERROR_TOKEN_TYPES[token.type]}`, token);
    }
}


async function parseImport(line: string, file: string, lineNumber: number): Promise<Token[]> {
    let items = line.split(' ');
    let vars: string[] = [];
    let i = 1;
    for (; i < items.length; i++) {
        if (items[i] === 'from') {
            break;
        } else {
            vars.push(...items[i].split(','));
        }
    }
    vars = vars.filter(x => x.trim() !== '');
    if (items[i] !== 'from' || vars.length === 0) {
        error('SyntaxError: Invalid import statement', line, file, lineNumber, 0);
    }
    let path = items.slice(i + 1).join(' ');
    if (path.endsWith('.js')) {
        if (path.startsWith('.')) {
            path = join(file, path);
        }
        let obj = await import(path);
        let out: Token[] = [];
        for (let name of vars) {
            out.push(createToken('keyword', 'let', file, lineNumber, 0));
            out.push(createToken('variable', name, file, lineNumber, 0));
            out.push(createToken('=', '=', file, lineNumber, 0));
            out.push({
                type: 'jsvalue',
                value: '',
                stack: [{file, line: lineNumber, col: 0}],
                data: obj[name],
            });
            out.push(createToken('\n', '\n', file, lineNumber, 0));
        }
        return out;
    } else {
        let data: string[];
        if (path.startsWith('http://') || path.startsWith('https://')) {
            let response = await fetch(path);
            if (!response.ok) {
                error(`ImportError: ${response.status} ${response.statusText} while fetching import`, 'x', file, lineNumber, 0);
            }
            data = (await response.text()).replaceAll('\r', '').split('\n');
        } else {
            if (path.startsWith('.')) {
                path = join(dirname(file), path);
            } else if (!path.startsWith('/')) {
                path = join(import.meta.dirname, '../stdlib', path);
            }
            if (!exists(path)) {
                error(`ImportError: '${path}' does not exist`, 'x', file, lineNumber, 0);
            }
            data = (await fs.readFile(path)).toString().replaceAll('\r', '').split('\n');
        }
        rawFiles[path] = data;
        if (path.endsWith('.rle')) {
            let index = data.findIndex(line => !line.startsWith('#') && !line.startsWith('x'));
            let rle = data.slice(index).join('');
            return [
                createToken('variable', vars[0], file, lineNumber, 0),
                createToken('=', '=', file, lineNumber, 0),
                createToken('rle', rle, path, index, 0),
                createToken('\n', '\n', file, lineNumber, line.length),
            ];
        } else {
            let out: Token[] = [createToken('keyword', 'let', file, lineNumber, 0)];
            for (let name of vars) {
                out.push(createToken('variable', name, file, lineNumber, 0));
            }
            out.push(createToken('\n', '\n', file, lineNumber, 0));
            out.push(createToken('{', '{', file, lineNumber, 0));
            out.push(...(await tokenize({file: path, lines: data}, false)).tokens);
            out.push(createToken('}', '}', file, lineNumber, 0));
            out.push(createToken('\n', '\n', file, lineNumber, line.length));
            return out;
        }
    }
}

const WORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$.';

const KEYWORDS: string[] = ['true', 'false', 'let', 'const', 'export', 'expand', 'function', 'return'] satisfies Keyword[];

function createWordToken(word: string, file: string, line: number, col: number): Token {
    let type: Token['type'];
    if (word.endsWith('!')) {
        type = 'rle';
    } else if (KEYWORDS.includes(word)) {
        type = 'keyword';
    } else if (word.match(/^(x[spq]\d+|apg)_/)) {
        type = 'apgcode';
    } else if (word.match(/^-?(\d+(.\d+)?|0b[01]+|0o[0-7]+|0x[0-9A-Fa-f]+)$/)) {
        type = 'number';
    } else if (word.match(/^[A-Z]*$/)) {
        type = 'transform';
    } else if (word.match(/^[a-z_][a-zA-Z0-9_]*$/)) {
        type = 'variable';
    } else {
        error(`SyntaxError: Invalid word: '${word}'`, word, file, line, col);
    }
    return createToken(type, word, file, line, col);
}

export async function tokenize<T extends boolean>(file: string | {file: string, lines: string[]}, requireRule: T): Promise<{tokens: Token[]} & (T extends true ? {rule: string} : {rule?: string})> {
    let lines: string[];
    if (typeof file === 'object') {
        lines = file.lines;
        file = file.file;
    } else {
        lines = (await fs.readFile(file)).toString().replaceAll('\r', '').split('\n');
        rawFiles[file] = lines;
    }
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
            out.push(createToken('rule', line, file, i, 0));
            out.push(createToken('\n', '\n', file, i, line.length + 1));
            rule = line.slice('rule '.length);
            continue;
        } else if (line.startsWith('import ')) {
            out.push(...(await parseImport(line, file, i)));
            continue;
        }
        let word = '';
        let parsingWord = false;
        let wordStartCol = 0;
        for (let col = 0; col < line.length; col++) {
            let char = line[col];
            if (parsingWord && WORD_CHARS.includes(char)) {
                word += char;
            } else {
                if (parsingWord) {
                    if (char === '!') {
                        word += char;
                    }
                    out.push(createWordToken(word, file, i, wordStartCol));
                    word = '';
                    parsingWord = false;
                    if (char === '!') {
                        continue;
                    }
                }
                if (char === ' ' || char === '\t') {
                    continue;
                } else if (WORD_CHARS.includes(char)) {
                    parsingWord = true;
                    word = char;
                    wordStartCol = col;
                } else if (char === ';') {
                    out.push(createToken('\n', ';', file, i, col));
                } else if (char === '=' || char === '+' || char === '-' || char === '*' || char === '&' || char === '|') {
                    if (line[col + 1] === char) {
                        col++;
                        out.push(createToken(char + char as '==' | '++' | '--' | '**' | '&&' | '||', char + char, file, i, col));
                    } else {
                        out.push(createToken(char, char, file, i, col));
                    }
                } else if (char === '{' || char == '}' || char === '[' || char === ']' || char === '(' || char === ')' || char === ',' || char === '@' || char === '/' || char === '%' || char === '~' || char === '!') {
                    out.push(createToken(char, char, file, i, col));
                } else if (char === '<' || char === '>') {
                    if (line[col + 1] === '=') {
                        col++;
                        out.push(createToken(char + '=' as '<=' | '>=', char + '=', file, i, col));
                    } else if (line[col + 1] === char) {
                        if (char === '>' && line[col + 2] === char) {
                            col += 2;
                            out.push(createToken('>>>', '>>>', file, i, col));
                        } else {
                            col++;
                            out.push(createToken(char + char as '<<' | '>>', char + char, file, i, col));
                        }
                    } else {
                        out.push(createToken(char, char, file, i, col));
                    }
                } else if (char === '!') {
                    if (line[col + 1] === '=') {
                        col++;
                        out.push(createToken('!=', '!=', file, i, col));
                    } else {
                        out.push(createToken('!', '!', file, i, col));
                    }
                } else {
                    error(`SyntaxError: Unrecognized character: '${char}'`, char, file, i, col);
                }
            }
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
