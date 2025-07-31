
import {join, dirname, readFile, exists, env, exit, dir, requireFrom, console} from './apis.js';


let rawFiles: {[key: string]: string[]} = {};

export function clearFileCache() {
    rawFiles = {};
}


export type Operator = '+' | '++' | '-' | '--' | '*' | '/' | '**' | '%' | '&' | '|' | '~' | '>>' | '>>>' | '<<' | '&&' | '||' | '!' | '==' | '!=' | '<' | '<=' | '>' | '>=';
export type Symbol = '=' | '{' | '}' | '[' | ']' | '(' | ')' | ',' | '@';
export type Transform = 'F' | 'Fx' | 'R' | 'Rx' | 'B' | 'Bx' | 'L' | 'Lx';
export type Keyword = 'true' | 'false' | 'let' | 'const' | 'export' | 'expand' | 'function' | 'return' | 'if' | 'else' | 'for' | 'while' | 'import' | 'from' | Transform | 'conduit';
export type TokenType = '\n' | 'rle' | 'apgcode' | 'number' | 'variable' | `keyword_${Keyword}` | Symbol | Operator | 'string' | 'directive' | 'jsvalue';

export interface BaseToken<T extends TokenType = TokenType> {
    type: T;
    value: string;
    stack: {
        file: string;
        line: number;
        col: number;
        length: number;
    }[];
}


export type TokenTypeMap = {
    '\n': BaseToken<'\n'>;
    'rle': BaseToken<'rle'>;
    'apgcode': BaseToken<'apgcode'>;
    'number': BaseToken<'number'> & {numValue: number};
    'variable': BaseToken<'variable'>;
    'string': BaseToken<'string'> & {data: string};
    'directive': BaseToken<'directive'>;
    'jsvalue': BaseToken<'jsvalue'> & {data: any};
}
 & {[K in Keyword as `keyword_${K}`]: BaseToken<`keyword_${K}`> & {value: K}}
 & {[K in Symbol as `${K}`]: BaseToken<`${K}`> & {value: Symbol}}
 & {[K in Operator as `${K}`]: BaseToken<`${K}`> & {value: Operator}};

export type Token<T extends TokenType = TokenType> = TokenTypeMap[T];

export function createToken<T extends TokenType>(type: T, value: string, file: string, line: number, col: number): Token<T> {
    let out: any = {type, value, stack: [{file, line, col, length: value.length}]};
    if (type === 'number') {
        out.numValue = parseInt(value);
    } else if (type === 'string') {
        out.data = value.slice(1, -1).replaceAll('\\n', '\\').replaceAll(/(?<!\\)\\(?!\\)/g, '').replaceAll('\\\\', '');
    }
    return out;
}


let homeDir = env.HOME;

export type ErrorMessage = `${string}Error: ${string}`;

export function error(msg: ErrorMessage, {value, stack}: Token): never;
export function error(msg: ErrorMessage, value: string, file: string, line: number, col: number): never;
export function error(msg: ErrorMessage, value: string | Token, file?: string, line?: number, col?: number): never {
    let actualStack: Token['stack'];
    if (typeof value === 'object') {
        actualStack = value.stack.reverse();
        value = value.value;
    } else {
        // @ts-ignore
        actualStack = [{file, line, col}];
    }
    for (let i = 0; i < actualStack.length; i++) {
        let {file, line, col, length} = actualStack[i];
        let filename = file;
        if (homeDir && filename.startsWith(homeDir)) {
            filename = '~' + filename.slice(homeDir.length);
        }
        msg += `\n    at ${filename}:${line + 1}:${col + 1}`;
        if (file in rawFiles) {
            msg += `\n        ${rawFiles[file][line]}`;
            msg += '\n        ' + ' '.repeat(col) + '^'.repeat(length) + ' (here)';
        }
    }
    if (env.FORCE_COLORS) {
        msg = '\x1b[91m' + msg + '\x1b[0m';
    }
    console.log(msg);
    exit(1);
}

export const ERROR_TOKEN_TYPES: {[K in TokenType]: string} = {
    '\n': 'newline',
    'rle': 'RLE',
    'apgcode': 'apgcode',
    'number': 'number',
    'variable': 'variable',
    'keyword_true': `keyword 'true'`,
    'keyword_false': `keyword 'false'`,
    'keyword_let': `keyword 'let'`,
    'keyword_const': `keyword 'const'`,
    'keyword_export': `keyword 'export'`,
    'keyword_expand': `keyword 'expand'`,
    'keyword_function': `keyword 'function'`,
    'keyword_return': `keyword 'return'`,
    'keyword_if': `keyword 'if'`,
    'keyword_else': `keyword 'else'`,
    'keyword_for': `keyword 'for'`,
    'keyword_while': `keyword 'while'`,
    'keyword_import': `keyword 'import'`,
    'keyword_from': `keyword 'from'`,
    'keyword_F': `keyword 'F'`,
    'keyword_Fx': `keyword 'Fx'`,
    'keyword_R': `keyword 'R'`,
    'keyword_Rx': `keyword 'Rx'`,
    'keyword_B': `keyword 'B'`,
    'keyword_Bx': `keyword 'Bx'`,
    'keyword_L': `keyword 'L'`,
    'keyword_Lx': `keyword 'Lx'`,
    'keyword_conduit': `keyword 'conduit'`,
    '=': 'equals sign',
    '{': 'opening brace',
    '}': 'closing brace',
    '[': 'opening bracket',
    ']': 'closing bracket',
    '(': 'opening parentheses',
    ')': 'closing parentheses',
    ',': 'comma',
    '@': 'at sign',
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
    'string': 'string',
    'directive': 'directive',
    'jsvalue': 'JavaScript value',
};

export function assertTokenType<T extends TokenType[]>(token: Token, ...types: T): asserts token is Token<T[number]> {
    if (!types.includes(token?.type)) {
        let typeStrings = types.map(x => ERROR_TOKEN_TYPES[x]);
        let expected = typeStrings.slice(0, -1).join(', ');
        if (expected.length > 0) {
            expected += ' or ';
        }
        expected += typeStrings[typeStrings.length - 1];
        let got = token === undefined ? 'nothing' : ERROR_TOKEN_TYPES[token.type];
        error(`SyntaxError: Expected ${expected}, got ${got}`, token);
    }
}

export function isKeyword(token: Token): token is Token<`keyword_${Keyword}`> {
    return token?.type.startsWith('keyword_');
}

const WORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$.';

const KEYWORDS: string[] = ['true', 'false', 'let', 'const', 'export', 'expand', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'from', 'F', 'Fx', 'R', 'Rx', 'B', 'Bx', 'L', 'Lx'] satisfies Keyword[];

function createWordToken(word: string, file: string, line: number, col: number): Token {
    let type: Token['type'];
    if (word.endsWith('!')) {
        type = 'rle';
    } else if (KEYWORDS.includes(word)) {
        type = `keyword_${word as Keyword}`;
    } else if (word.match(/^(x[spq]\d+|apg)_/)) {
        type = 'apgcode';
    } else if (word.match(/^-?(\d+(.\d+)?|0b[01]+|0o[0-7]+|0x[0-9A-Fa-f]+)$/)) {
        type = 'number';
    } else if (word.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        type = 'variable';
    } else {
        error(`SyntaxError: Invalid word: '${word}'`, word, file, line, col);
    }
    let out = createToken(type, word, file, line, col);
    return out;
}

async function _tokenize(file: string | {file: string, lines: string[]}): Promise<Token[]> {
    let lines: string[];
    if (typeof file === 'object') {
        lines = file.lines;
        file = file.file;
    } else {
        lines = (await readFile(file)).replaceAll('\r', '').split('\n');
        rawFiles[file] = lines;
    }
    let out: Token[] = [];
    let match: RegExpExecArray | null;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (match = /(?<!:)\/\/.*/.exec(line)) {
            line = line.slice(0, match.index);
        }
        if (line.length === 0) {
            continue;
        } else if (line.startsWith('#')) {
            out.push(createToken('directive', line, file, i, 0));
            out.push(createToken('\n', '\n', file, i, line.length));
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
                        out.push(createToken('' + char + char as TokenType, char + char, file, i, col));
                    } else if (char === '-' && '0123456789'.includes(line[col + 1])) {
                        parsingWord = true;
                        word = char + line[col + 1];
                        wordStartCol = col;
                        col++;
                    } else {
                        out.push(createToken('' + char as TokenType, char, file, i, col));
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
                    out.push({type: 'string', value: raw, data, stack: [{file, line: i, col: startCol, length: raw.length}]});
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
    return out;
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
        } else if (token.type === 'keyword_else' && parenStack.length === 0) {
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
        } else if (line[0].type === 'keyword_import' || (line[0].type === 'keyword_export' && line.some(x => x.type === 'keyword_from'))) {
            let imports: Token[] = [];
            let i = 0;
            while (i < line.length) {
                let token = line[++i];
                if (token.type === ',') {
                    continue;
                } else if (token.type === 'variable' || token.type === '*') {
                    imports.push(token);
                } else {
                    break;
                }
            }
            for (let token of imports) {
                if (token.type === '*') {
                    if (imports.length !== 1) {
                        error(`SyntaxError: When '${line[0].value} *' is used, nothing else can be ${line[0].value}ed`, line[0]);
                    }
                }
            }
            let specifier: Token;
            let fromToken = line[i];
            if (imports.length !== 0 || line[0].type === 'keyword_export') {
                assertTokenType(fromToken, 'keyword_from');
            } else {
                assertTokenType(fromToken, 'keyword_from', 'string');
            }
            if (fromToken.type === 'keyword_from') {
                specifier = line[i + 1];
            } else {
                specifier = fromToken;
            }
            let file = tokens[0].stack[0].file;
            let lineNumber = line[0].stack[0].line;
            assertTokenType(specifier, 'string');
            let path = specifier.data;
            if (path.startsWith('.')) {
                path = join(dirname(file), path);
            } else if (!path.startsWith('/') && !path.startsWith('http://') && !path.startsWith('https://')) {
                path = join(dir, '../stdlib', path);
            }
            if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs')) {
                if (!allowJSImports) {
                    error(`ImportError: JS imports are not allowed`, specifier);
                }
                let obj = await requireFrom(file, path);
                for (let name of imports) {
                    if (name.type === '*') {
                        error(`SyntaxError: Cannot use '${line[0].type.slice('keyword_'.length)} *' with JS imports`, name);
                    }
                    let value = obj[name.value];
                    out.push(
                        createToken('keyword_let', 'let', file, lineNumber, 0),
                        createToken('variable', name.value, file, lineNumber, 0),
                        createToken('=', '=', file, lineNumber, 0),
                        {
                            type: 'jsvalue',
                            value: typeof value === 'object' && value !== 'null' || typeof value === 'function' ? Object.prototype.toString.call(obj[name.value]) : '[primitive ' + String(value) + ']',
                            stack: [{file, line: lineNumber, col: 0, length: 1}],
                            data: obj[name.value],
                        },
                        createToken('\n', '\n', file, lineNumber, 0),
                    );
                }
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
                        if (exists(path + '.cap')) {
                            path += '.cap';
                        } else if (exists(join(path, '.rle'))) {
                            path += '.rle';
                        } else {
                            error(`ImportError: '${path}' does not exist`, specifier);
                        }
                    }
                    data = (await readFile(path)).replaceAll('\r', '').split('\n');
                }
                rawFiles[path] = data;
                if (path.endsWith('.rle')) {
                    let index = data.findIndex(line => !line.startsWith('#') && !line.startsWith('x'));
                    let rle = data.slice(index).join('');
                    if (imports[0].type === '*') {
                        error(`SyntaxError: Cannot use '${line[0].value} *' with a RLE import`, imports[0]);
                    }
                    out.push(
                        imports[0],
                        createToken('=', '=', file, lineNumber, 0),
                        createToken('rle', rle, path, index, 0),
                        createToken('\n', '\n', file, lineNumber, line.length),
                    );
                } else {
                    let tokens = await _tokenize({file: path, lines: data});
                    tokens = await doImports(tokens, allowJSImports);
                    if (imports.length > 0) {
                        out.push(createToken('keyword_let', 'let', file, lineNumber, 0));
                        if (imports[0].type === '*') {
                            imports = [];
                            for (let line of splitByNewlines(tokens)) {
                                if (line[0]?.type === 'keyword_export') {
                                    if (line[1]?.type === 'keyword_function' || line[3]?.type === '=') {
                                        imports.push(line[2]);
                                    } else {
                                        imports.push(...line.slice(2).filter(x => x.type === 'variable'));
                                    }
                                }
                            }
                        }
                        out.push(
                            ...imports,
                            createToken('\n', '\n', file, lineNumber, 0),
                        );
                    }
                    out.push(
                        createToken('{', '{', file, lineNumber, 0),
                        ...tokens,
                        createToken('}', '}', file, lineNumber, 0),
                        createToken('\n', '\n', file, lineNumber, line.length),
                    );
                }
            }
            if (line[0].type === 'keyword_export') {
                out.push(
                    createToken('keyword_export', 'export', file, lineNumber, 0),
                    ...imports,
                    createToken('\n', '\n', file, lineNumber, 0),
                );
            }
        } else {
            let entry = line[0].stack[0];
            out.push(...line, createToken('\n', '\n', entry.file, entry.line, rawFiles[entry.file][entry.line].length));
        }
    }
    return out;
}


export async function tokenize(path: string, allowJSImports: boolean = false): Promise<Token[]> {
    let tokens = await _tokenize(path);
    tokens = await doImports(tokens, allowJSImports);
    return tokens;
}
