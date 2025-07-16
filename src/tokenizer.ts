
import {join, dirname} from 'node:path';
import * as fs from 'node:fs/promises';
import {existsSync as exists} from 'node:fs';
import {createRequire} from 'node:module';


let rawFiles: {[key: string]: string[]} = {};

export function clearFileCache() {
    rawFiles = {};
}


export type Operator = '+' | '++' | '-' | '--' | '*' | '/' | '**' | '%' | '&' | '|' | '~' | '>>' | '>>>' | '<<' | '&&' | '||' | '!' | '==' | '!=' | '<' | '<=' | '>' | '>=';
export type Symbol = Operator | '=' | '{' | '}' | '[' | ']' | '(' | ')' | ',' | '@';
export type TokenType = '\n' | 'rle' | 'apgcode' | 'number' | 'transform' | 'variable' | 'rule' | 'keyword' | 'jsvalue' | 'string' | Symbol;

export interface BaseToken<T extends TokenType = TokenType> {
    type: T;
    value: string;
    stack: {
        file: string;
        line: number;
        col: number;
    }[];
}

export type Keyword = 'true' | 'false' | 'let' | 'const' | 'export' | 'expand' | 'function' | 'return' | 'if' | 'else' | 'for' | 'while' | 'import' | 'from';

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
    'string': BaseToken<'string'> & {data: string};
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
    if (process.env.FORCE_COLORS !== undefined && process.env.FORCE_COLORS !== '') {
        msg = '\x1b[91m' + msg + '\x1b[0m';
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
    'string': 'string',
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

const WORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$.';

const KEYWORDS: string[] = ['true', 'false', 'let', 'const', 'export', 'expand', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'from'] satisfies Keyword[];

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

async function _tokenize<T extends boolean>(file: string | {file: string, lines: string[]}, requireRule: T): Promise<{tokens: Token[]} & (T extends true ? {rule: string} : {rule?: string})> {
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
                    } else if (char === '-' && '0123456789'.includes(line[col + 1])) {
                        parsingWord = true;
                        word = char + line[col + 1];
                        wordStartCol = col;
                        col++;
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
                } else if (char === '"' || char === "'") {
                    let startQuote = char;
                    let startCol = col;
                    let raw = startQuote;
                    let data = '';
                    let wasBackslash = false;
                    while (col < line.length) {
                        char = line[++col];
                        if (!wasBackslash) {
                            if (char === '\\') {
                                wasBackslash = true;
                                continue;
                            } else if (char === startQuote) {
                                break;
                            }
                        }
                        raw += char;
                        data += char;
                    }
                    raw += char;
                    out.push({type: 'string', value: raw, data, stack: [{file, line: i, col: startCol}]});
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
        } else if (token.type === 'keyword' && token.keyword === 'else' && parenStack.length === 0) {
            out.push(line);
            line = [];
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


async function doImports(tokens: Token[], allowJSImports: boolean): Promise<Token[]> {
    let out: Token[] = [];
    for (let line of splitByNewlines(tokens)) {
        if (line.length === 0) {
            continue;
        } else if (line[0].type === 'keyword' && line[0].keyword === 'import') {
            let imports: Token[] = [];
            let i = 0;
            while (i < line.length) {
                let token = line[++i];
                if (token.type === ',') {
                    continue;
                } else if (token.type === 'variable') {
                    imports.push(token);
                } else {
                    break;
                }
            }
            let fromToken = line[i];
            assertTokenType(fromToken, 'keyword');
            if (fromToken.keyword !== 'from') {
                error(`SyntaxError: Expected keyword 'from', got keyword '${fromToken.keyword}'`, fromToken);
            }
            let specifier = line[i + 1];
            let file = tokens[0].stack[0].file;
            let lineNumber = line[0].stack[0].line;
            assertTokenType(specifier, 'string');
            let path = specifier.data;
            if (path.startsWith('.')) {
                path = join(dirname(file), path);
            } else if (!path.startsWith('/') && !path.startsWith('http://') && !path.startsWith('https://')) {
                path = join(import.meta.dirname, '../stdlib', path);
            }
            if (path.endsWith('.js')) {
                if (!allowJSImports) {
                    error(`ImportError: JS imports are not allowed`, specifier);
                }
                let obj = createRequire(file)(path);
                let out: Token[] = [];
                for (let name of imports) {
                    out.push(
                        createToken('keyword', 'let', file, lineNumber, 0),
                        createToken('variable', name.value, file, lineNumber, 0),
                        createToken('=', '=', file, lineNumber, 0),
                        {
                            type: 'jsvalue',
                            value: '',
                            stack: [{file, line: lineNumber, col: 0}],
                            data: obj[name.value],
                        },
                        createToken('\n', '\n', file, lineNumber, 0),
                    );
                }
                return out;
            } else {
                let data: string[];
                if (path.startsWith('http://') || path.startsWith('https://')) {
                    let response = await fetch(path);
                    if (!response.ok) {
                        error(`ImportError: ${response.status} ${response.statusText} while fetching import`, specifier);
                    }
                    data = (await response.text()).replaceAll('\r', '').split('\n');
                } else {
                    if (!exists(path)) {
                        error(`ImportError: '${path}' does not exist`, specifier);
                    }
                    data = (await fs.readFile(path)).toString().replaceAll('\r', '').split('\n');
                }
                rawFiles[path] = data;
                if (path.endsWith('.rle')) {
                    let index = data.findIndex(line => !line.startsWith('#') && !line.startsWith('x'));
                    let rle = data.slice(index).join('');
                    out.push(
                        imports[0],
                        createToken('=', '=', file, lineNumber, 0),
                        createToken('rle', rle, path, index, 0),
                        createToken('\n', '\n', file, lineNumber, line.length),
                    );
                } else {
                    out.push(
                        createToken('keyword', 'let', file, lineNumber, 0),
                        ...imports,
                        createToken('\n', '\n', file, lineNumber, 0),
                        createToken('{', '{', file, lineNumber, 0),
                        ...(await _tokenize({file: path, lines: data}, false)).tokens,
                        createToken('}', '}', file, lineNumber, 0),
                        createToken('\n', '\n', file, lineNumber, line.length),
                    );
                }
            }
        } else {
            let entry = line[0].stack[0];
            out.push(...line, createToken('\n', '\n', entry.file, entry.line, rawFiles[entry.file][entry.line].length));
        }
    }
    return out;
}


export async function tokenize(path: string, allowJSImports: boolean = false): Promise<{tokens: Token[], rule: string}> {
    let {tokens, rule} = await _tokenize(path, true);
    tokens = await doImports(tokens, allowJSImports);
    return {tokens, rule};
}
