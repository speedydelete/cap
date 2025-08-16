
import {Token, error, assertTokenType, splitByNewlines, ERROR_TOKEN_TYPES, isKeyword} from './tokenizer.js';
import {runExpressions, runExpression} from './expressions.js';
import {replacePipes, replaceConduits} from './conduits.js';


export interface ScopeEntry {
    value: Token[];
    isConst: boolean;
}

export class Scope {

    parent: Scope | null;
    vars: Map<string, ScopeEntry>;

    constructor(parent: Scope | null = null) {
        this.parent = parent;
        this.vars = new Map();
    }

    _get(token: Token, force: boolean = true): ScopeEntry {
        let value = this.vars.get(token.value);
        if (value !== undefined) {
            let out: ScopeEntry;
            if (value.value.some(x => x.type === 'jsvalue')) {
                out = {value: [], isConst: value.isConst};
                for (let token of value.value) {
                    if (token.type === 'jsvalue') {
                        out.value.push({type: 'jsvalue', value: token.value, stack: structuredClone(token.stack), data: token.data});
                    } else {
                        out.value.push(structuredClone(token));
                    }
                }
            } else {
                out = structuredClone(value);
            }
            out.value.forEach(x => x.stack.push(...token.stack));
            return out;
        } else if (this.parent) {
            return this.parent._get(token);
        } else if (!force) {
            return {value: [token], isConst: false};
        } else {
            error(`ReferenceError: ${token.value} is not defined`, token);
        }
    }

    get(token: Token, force: boolean = true): Token[] {
        return this._get(token, force).value;
    }

    set(name: Token, value: Token[], isConst: boolean = false): void {
        if (this.vars.get(name.value)?.isConst) {
            error(`ConstError: Cannot set const variable '${name.value}`, name);
        }
        this.vars.set(name.value, {value, isConst});
    }

    _change(name: Token, value: Token[], isConst: boolean): boolean {
        let thisVar = this.vars.get(name.value);
        if (thisVar) {
            if (thisVar.isConst) {
                error(`ConstError: Cannot set const variable '${name.value}'`, name);
            }
            this.vars.set(name.value, {value, isConst});
            return true;
        } else if (this.parent) {
            return this.parent._change(name, value, isConst);
        } else {
            return false;
        }
    }

    change(name: Token, value: Token[], isConst: boolean = false): void {
        if (!this._change(name, value, isConst)) {
            error(`ScopeError: Variable '${name.value}' is not declared`, name);
        }
    }

    isConst(name: Token): boolean {
        return this._get(name, false).isConst;
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

function replaceVariables(tokens: Token[], scope: Scope, force: boolean = true): Token[] {
    let out: Token[] = [];
    let braceCount = 0;
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'variable' && braceCount === 0) {
            out.push(...scope.get(token, force));
        } else {
            if (token.type === '{') {
                braceCount++;
            } else if (token.type === '}') {
                braceCount--;
            }
            out.push(token);
        }
    }
    return out;
}

function runFunction(line: Token[], i: number, scope: Scope): [Token[], number] {
    let braceCount = 1;
    let section: Token[] = [];
    while (braceCount > 0) {
        let token = line[++i];
        section.push(token);
        if (token.type === '{') {
            braceCount++;
        } else if (token.type === '}') {
            braceCount--;
            if (braceCount === 0) {
                break;
            }
        }
    }
    section.pop();
    while (section[0].type === '\n') {
        section.shift();
    }
    if (section[0].type === '(') {
        section.shift();
        let args: string[] = [];
        let wasComma = true;
        let j = 0;
        for (; j < section.length; j++) {
            let token = section[j];
            if (token.type === ')') {
                break
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
        let argInputs: Token[][];
        if (!parenToken && args.length === 0) {
            argInputs = [];
        } else {
            assertTokenType(parenToken, '(');
            argInputs = [];
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
                } else if (token.type === ',' && parenCount < 2) {
                    argInputs.push(currentArgInput);
                    currentArgInput = [];
                    continue;
                }
                currentArgInput.push(token);
            }
            if (currentArgInput.length > 0) {
                argInputs.push(currentArgInput);
            }
        }
        if (args.length !== argInputs.length) {
            error(`ArgumentError: Function takes ${args.length} argument${args.length === 1 ? '' : 's'} but ${argInputs.length} argument${argInputs.length === 1 ? ' was' : 's were'} provided`, parenToken);
        }
        let funcScope = new Scope(scope);
        for (let i = 0; i < args.length; i++) {
            funcScope.vars.set(args[i], {value: argInputs[i], isConst: false});
        }
        section = expand(section, funcScope);
    } else {
        section = expand(section, new Scope(scope));
        if (line[i + 1]?.type === '(') {
            if (line[i + 2]?.type === ')') {
                i += 2;
            } else {
                error(`ArgumentError: Function takes 0 arguments but at least 1 was provided`, line[i + 1]);
            }
        }
    }
    return [section, i];
}

function checkExpandKeyword(tokens: Token[], scope: Scope): Token[] {
    if (tokens[0]?.type === 'keyword_expand') {
        tokens = expand(tokens.slice(1), scope);
        while (tokens[tokens.length - 1]?.type === '\n') {
            tokens.pop();
        }
    }
    return tokens;
}

function isTokenArray(value: any): value is Token[] {
    return Array.isArray(value) && value.every(x => typeof x === 'object' && typeof x.type === 'string' && typeof x.value === 'string' && Array.isArray(x.stack));
}

function replaceJS(tokens: Token[]): Token[] {
    if (tokens.every(x => x.type !== 'jsvalue')) {
        return tokens;
    }
    let out: Token[] = [];
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'jsvalue') {
            let value = token.data;
            if (typeof value === 'function') {
                assertTokenType(tokens[++i], '(');
                let parenCount = 1;
                let args: Token[][] = [];
                let currentArg: Token[] = [];
                while (i < tokens.length) {
                    let token = tokens[++i];
                    if (token.type === '(' || token.type === '{' || token.type === '[') {
                        parenCount++;
                    } else if (token.type === ')' || token.type === '}' || token.type === ']') {
                        parenCount--;
                        if (parenCount === 0) {
                            break;
                        }
                    } else if (token.type === ',' && parenCount === 0) {
                        args.push(currentArg);
                        currentArg = [];
                        continue;
                    }
                    currentArg.push(token);
                }
                if (parenCount !== 0) {
                    error(`SyntaxError: Expected opening parentheses`, tokens[tokens.length - 1]);
                }
                if (currentArg.length > 0) {
                    args.push(currentArg);
                }
                value = value(...args);
                if (typeof value === 'function') {
                    tokens.splice(i + 1, 0, {type: 'jsvalue', value: '[object Function]', data: value, stack: token.stack});
                } else if (isTokenArray(value)) {
                    out.push(...value);
                } else {
                    error(`JSTypeError: Expected function or array of tokens, got ${token.value}`, token);
                }
            } else if (isTokenArray(value)) {
                out.push(...value);
            } else {
                error(`JSTypeError: Expected function or array of tokens, got ${token.value}`, token);
            }
        } else {
            out.push(token);
        }
    }
    return out;
}

export function expand(tokens: Token[], scope: Scope = new Scope()): Token[] {
    let out: Token[] = [];
    let ifWasTrue = false;
    for (let line of splitByNewlines(tokens)) {
        if (line.length === 0) {
            continue;
        } else if (line[1]?.type === '=') {
            assertTokenType(line[0], 'variable');
            scope.change(line[0], checkExpandKeyword(line.slice(2), scope));
        } else if (isKeyword(line[0])) {
            if (line[0].type === 'keyword_let' || line[0].type === 'keyword_const') {
                if (line[2]?.type === '=') {
                    assertTokenType(line[1], 'variable');
                    scope.set(line[1], checkExpandKeyword(line.slice(3), scope), line[0].type === 'keyword_const');
                } else if (line[0].type === 'keyword_let') {
                    for (let token of line.slice(1)) {
                        if (token.type === 'variable') {
                            scope.set(token, []);
                        } else if (token.type === ',') {
                            continue;
                        } else {
                            error(`SyntaxError: Expected variable or comma, got ${ERROR_TOKEN_TYPES[token.type]}`, token);
                        }
                    }
                } else {
                    error(`SyntaxError: Const declarations must have an initializer`, line[0]);
                }
            } else if (line[0].type === 'keyword_export') {
                if (line[1]?.type === 'variable') {
                    for (let token of line.slice(1)) {
                        if (token.type === 'variable') {
                            scope.parent?._change(token, scope.get(token), scope.isConst(token));
                        } else if (token.type === ',') {
                            continue;
                        } else {
                            error(`SyntaxError: Expected variable or comma, got ${ERROR_TOKEN_TYPES[token.type]}`, token);
                        }
                    }
                } else if (isKeyword(line[1])) {
                    let value: Token[];
                    if (line[1].type === 'keyword_let' || line[1].type === 'keyword_const') {
                        assertTokenType(line[2], 'variable');
                        assertTokenType(line[3], '=');
                        value = checkExpandKeyword(line.slice(4), scope);
                    } else if (line[1].type === 'keyword_function') {
                        assertTokenType(line[2], 'variable');
                        assertTokenType(line[3], '(');
                        let index = line.findIndex(token => token.type === ')');
                        if (index === -1) {
                            error(`SyntaxError: Function declarations must contain a closing parentheses`, line[0]);
                        }
                        assertTokenType(line[index + 1], '{');
                        value = [line[index + 1], ...line.slice(3, index + 1), ...line.slice(index + 2)];
                    } else {
                        error(`SyntaxError: Expected 'let', 'const', or 'function'`, line[1]);
                    }
                    if (!scope._change(line[2], value, line[1].type !== 'keyword_let')) {
                        scope.set(line[2], value, line[1].type !== 'keyword_let');
                    }
                } else {
                    error(`SyntaxError: Expected keyword or variable, got ${line[1] ? ERROR_TOKEN_TYPES[line[1].type] : 'nothing'}`, line[1] ? line[1] : line[0]);
                }
            } else if (line[0].type === 'keyword_function') {
                assertTokenType(line[1], 'variable');
                assertTokenType(line[2], '(');
                let index = line.findIndex(token => token.type === ')');
                if (index === -1) {
                    error(`SyntaxError: Function declarations must contain a closing parentheses`, line[0]);
                }
                assertTokenType(line[index + 1], '{');
                scope.set(line[1], [line[index + 1], ...line.slice(2, index + 1), ...line.slice(index + 2)]);
            } else if (line[0].type === 'keyword_return') {
                return out;
            } else if (line[0].type === 'keyword_if' || line[0].type === 'keyword_while' || line[0].type === 'keyword_for') {
                assertTokenType(line[1], '(');
                let parenCount = 1;
                let i = 2;
                let expr: Token[] = [];
                while (i < line.length) {
                    let token = line[i++];
                    if (token.type === '(') {
                        parenCount++;
                    } else if (token.type === ')') {
                        parenCount--;
                        if (parenCount === 0) {
                            break;
                        }
                    }
                    expr.push(token);
                }
                let body = line.slice(i);
                if (line[0].type === 'keyword_if') {
                    if (runExpression(expand(expr, scope)).numValue !== 0) {
                        out.push(...expand(body, scope));
                        ifWasTrue = true;
                    } else {
                        ifWasTrue = false;
                    }
                } else if (line[0].type === 'keyword_while') {
                    while (runExpression(expand(expr, scope)).numValue !== 0) {
                        out.push(...expand(body, scope));
                    }
                } else {
                    let lines = splitByNewlines(expr);
                    if (lines.length !== 3) {
                        error(`SyntaxError: Expected 3 lines inside for statement`, line[0]);
                    }
                    let forScope = new Scope(scope);
                    out.push(...expand(lines[0], forScope));
                    while (runExpression(expand(lines[1], forScope)).numValue !== 0) {
                        out.push(...expand(body, forScope));
                        out.push(...expand(lines[2], forScope));
                    }
                }
            } else if (line[0].type === 'keyword_else') {
                if (!ifWasTrue) {
                    out.push(...expand(line.slice(1), scope));
                }
            }
        } else if (line[0].type === 'directive') {
            out.push(line[0]);
            out.push({type: '\n', value: '\n', stack: structuredClone(line[0].stack)});
        } else if (line.length === 2 && line[0].type === 'variable' && (line[1].type === '++' || line[1].type === '--')) {
            let tokens = scope.get(line[0]);
            if (tokens.length !== 1 || tokens[0].type !== 'number') {
                error(`SyntaxError: Invalid value for shorthand ${line[1].type}`, tokens[0]);
            }
            let value = structuredClone(tokens[0]);
            if (line[1].type === '++') {
                value.numValue++;
            } else {
                value.numValue--;
            }
            scope.change(line[0], [value]);
        } else {
            line = replaceVariables(line, scope, false);
            let sections: (Token | Token[])[] = [];
            for (let i = 0; i < line.length; i++) {
                let token = line[i];
                if (token.type === '{') {
                    let [section, newI] = runFunction(line, i, scope);
                    sections.push(section);
                    i = newI;
                } else {
                    sections.push(token);
                }
            }
            for (let line of combinations(sections)) {
                out.push(...replaceConduits(replacePipes(replaceJS(replaceVariables(line, scope)))));
                out.push({type: '\n', value: '\n', stack: structuredClone(line[0].stack)});
            }
        }
    }
    return runExpressions(out);
}
