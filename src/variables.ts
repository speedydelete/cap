
import {inspect} from 'node:util';
import {Operator, Token, error, assertTokenType, splitByNewlines, ERROR_TOKEN_TYPES, createToken} from './tokenizer.js';


export class Scope {

    parent: Scope | null;
    vars: Map<string, {value: Token[], const: boolean}>;

    constructor(parent: Scope | null = null) {
        this.parent = parent;
        this.vars = new Map();
    }

    get(token: Token, force: boolean = true): Token[] {
        let value = this.vars.get(token.value)?.value;
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

    set(name: Token, value: Token[], const_: boolean = false): void {
        if (this.vars.get(name.value)?.const) {
            error(`ScopeError: Cannot set const variable '${name.value}`, name);
        }
        this.vars.set(name.value, {value, const: const_});
    }

    _change(name: Token, value: Token[], const_: boolean): boolean {
        let thisVar = this.vars.get(name.value);
        if (thisVar) {
            if (thisVar.const) {
                error(`ScopeError: Cannot set const variable '${name.value}'`, name);
            }
            this.vars.set(name.value, {value, const: const_});
            return true;
        } else if (this.parent) {
            return this.parent._change(name, value, const_);
        } else {
            return false;
        }
    }

    change(name: Token, value: Token[], const_: boolean = false): void {
        if (!this._change(name, value, const_)) {
            error(`ScopeError: Variable '${name.value}' is not declared`, name);
        }
    }

}


const PRECEDENCE: {[K in Operator]: number} = {
    '++': 7,
    '--': 7,
    '~': 7,
    '!': 7,
    '**': 6,
    '*': 5,
    '/': 5,
    '%': 5,
    '+': 4,
    '-': 4,
    '>>': 3,
    '>>>': 3,
    '<<': 3,
    '==': 2,
    '!=': 2,
    '<': 2,
    '<=': 2,
    '>': 2,
    '>=': 2,
    '&': 1,
    '|': 1,
    '&&': 1,
    '||': 1,
};

function infixToPostfix(tokens: Token[]): Token<'number' | Operator>[] {
    let out: Token<'number' | Operator>[] = [];
    let stack: Token<'(' | Operator>[] = [];
    for (let token of tokens) {
        if (token.type === 'number') {
            out.push(token);
        } else if (token.type === 'keyword') {
            if (token.keyword === 'true' || token.keyword === 'false') {
                out.push({
                    type: 'number',
                    value: token.keyword,
                    numValue: token.keyword === 'true' ? 1 : 0,
                    stack: token.stack
                });
            } else {
                error(`SyntaxError: Unrecognized keyword in expression evaluation: '${token.keyword}'`, token);
            }
        } else if (token.type === '\n') {
            continue;
        } else if (token.type === '(') {
            stack.push(token);
        } else if (token.type === ')') {
            while (stack[stack.length - 1]?.type !== '(') {
                out.push(stack.pop() as Token<Operator>);
            }
            stack.pop();
        } else if (token.type === '+' || token.type === '-' || token.type === '*' || token.type === '/' || token.type === '**' || token.type === '%' || token.type === '&' || token.type === '|' || token.type === '~' || token.type === '>>' || token.type === '<<' || token.type === '&&' || token.type === '||' || token.type === '!' || token.type === '==' || token.type === '!=' || token.type === '<' || token.type === '<=' || token.type === '>' || token.type === '>=') {
            while (stack.length > 0) {
                let op = stack[stack.length - 1];
                if (op.type === '(') {
                    break;
                } else if (PRECEDENCE[op.type] >= PRECEDENCE[token.type]) {
                    stack.pop();
                    out.push(op);
                }
            }
            stack.push(token);
        } else {
            error(`SyntaxError: Expected number, keyword, operator, parentheses, or newline, got ${ERROR_TOKEN_TYPES[token.type]}`, token);
        }
    }
    while (stack.length > 0) {
        out.push(stack.pop() as Token<Operator>);
    }
    console.log(out);
    return out;
}

function runExpression(tokens: Token[]): Token[] {
    let stack: Token<'number'>[] = [];
    for (let token of infixToPostfix(tokens)) {
        if (token.type === 'number') {
            stack.push(token);
        } else {
            let op = token.type;
            let out: number;
            if (stack.length < 2) {
                if (stack.length === 0) {
                    error(`SyntaxError: Operators require arguments`, token);
                }
                let value = (stack.pop() as Token<'number'>).numValue;
                if (op === '+') {
                    out = +value;
                } else if (op === '-') {
                    out = -value;
                } else if (op === '++') {
                    out = value + 1;
                } else if (op === '--') {
                    out = value - 1;
                } else if (op === '!') {
                    out = value > 0 ? 0 : 1;
                } else if (op === '~') {
                    out = ~value;
                } else {
                    error(`SyntaxError: Binary operators require 2 arguments`, token);
                }
            } else {
                let left = (stack.pop() as Token<'number'>).numValue;
                let right = (stack.pop() as Token<'number'>).numValue;
                if (op === '+') {
                    out = left + right;
                } else if (op === '-') {
                    out = left - right;
                } else if (op === '*') {
                    out = left * right;
                } else if (op === '/') {
                    out = left / right;
                } else if (op === '**') {
                    out = left ** right;
                } else if (op === '%') {
                    out = left % right;
                } else if (op === '&') {
                    out = left & right;
                } else if (op === '|') {
                    out = left | right;
                } else if (op === '>>') {
                    out = left >> right;
                } else if (op === '>>>') {
                    out = left >>> right;
                } else if (op === '<<') {
                    out = left << right;
                } else if (op === '&&') {
                    out = left && right;
                } else if (op === '||') {
                    out = left || right;
                } else if (op === '==') {
                    out = left === right ? 1 : 0;
                } else if (op === '!=') {
                    out = left !== right ? 1 : 0;
                } else if (op === '<') {
                    out = left < right ? 1 : 0;
                } else if (op === '<=') {
                    out = left <= right ? 1 : 0;
                } else if (op === '>') {
                    out = left > right ? 1 : 0;
                } else if (op === '>=') {
                    out = left >= right ? 1 : 0;
                } else {
                    error(`InternalError: Unrecognized operator: '${token.type}'`, token);
                }
            }
            stack.push({
                type: 'number',
                value: String(out),
                numValue: out,
                stack: token.stack,
            });
        }
    }
    return stack;
}

function runExpressions(tokens: Token[]): Token[] {
    let out: Token[] = [];
    let parenCount = 0;
    let currentExpr: Token[] = [];
    let wasBrace = false;
    for (let token of tokens) {
        if (token.type === '(' && !wasBrace) {
            wasBrace = false;
            parenCount++;
            if (parenCount === 1) {
                continue;
            }
        } else if (token.type === ')') {
            wasBrace = false;
            parenCount--;
            if (parenCount === 0) {
                out.push(...runExpression(currentExpr));
                currentExpr = [];
                continue;
            }
        } else if (token.type === '{') {
            wasBrace = true;
        } else {
            wasBrace = false;
        }
        if (parenCount > 0) {
            currentExpr.push(token);
        } else {
            out.push(token);
        }
    }
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

function replaceVariablesSimple(tokens: Token[], scope: Scope, force: boolean = true): Token[] {
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
        }
        if (args.length !== argInputs.length) {
            error(`ArgumentError: Function takes ${args.length} argument${args.length === 1 ? '' : 's'} but ${argInputs.length} argument${argInputs.length === 1 ? ' was' : 's were'} provided`, parenToken);
        }
        let funcScope = new Scope(scope);
        for (let i = 0; i < args.length; i++) {
            funcScope.vars.set(args[i], {value: argInputs[i], const: false});
        }
        section = replaceVariables(section, funcScope);
    } else {
        section = replaceVariables(section, new Scope(scope));
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
    if (tokens[0]?.type === 'keyword' && tokens[0].keyword === 'expand') {
        tokens = replaceVariables(tokens.slice(1), scope);
        while (tokens[tokens.length - 1]?.type === '\n') {
            tokens.pop();
        }
    }
    return tokens;
}

export function replaceVariables(tokens: Token[], scope: Scope = new Scope()): Token[] {
    let out: Token[] = [];
    for (let line of splitByNewlines(tokens)) {
        if (line.length === 0) {
            continue;
        } else if (line[1]?.type === '=') {
            assertTokenType(line[0], 'variable');
            scope.change(line[0], checkExpandKeyword(line.slice(2), scope));
        } else if (line[0].type === 'keyword') {
            if (line[0].keyword === 'let' || line[0].keyword === 'const') {
                if (line[2]?.type === '=') {
                    assertTokenType(line[1], 'variable');
                    scope.set(line[1], checkExpandKeyword(line.slice(3), scope), line[0].keyword === 'const');
                } else if (line[0].keyword === 'let') {
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
            } else if (line[0].keyword === 'export') {
                assertTokenType(line[1], 'keyword');
                if (line[1].keyword !== 'let' && line[1].keyword !== 'const') {
                    error(`SyntaxError: Expected let or const`, line[1]);
                }
                assertTokenType(line[2], 'variable');
                assertTokenType(line[3], '=');
                scope.change(line[2], checkExpandKeyword(line.slice(4), scope), line[1].keyword === 'const');
            } else if (line[0].keyword === 'function') {
                assertTokenType(line[1], 'variable');
                assertTokenType(line[2], '(');
                let index = line.findIndex(token => token.type === ')');
                if (index === -1) {
                    error(`SyntaxError: Function declarations must contain a closing parentheses`, line[0]);
                }
                assertTokenType(line[index + 1], '{');
                scope.set(line[1], [line[index + 1], ...line.slice(2, index + 1), ...line.slice(index + 2)]);
            } else if (line[0].keyword === 'return') {
                return out;
            }
        } else if (line[0].type === 'rule') {
            out.push(line[0]);
            out.push({type: '\n', value: '\n', stack: structuredClone(line[0].stack)});
        } else {
            line = replaceVariablesSimple(line, scope, false);
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
                out.push(...replaceVariablesSimple(line, scope));
                out.push({type: '\n', value: '\n', stack: structuredClone(line[0].stack)});
            }
        }
    }
    return runExpressions(out);
}
