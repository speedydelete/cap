
import {Operator, Token, error, ERROR_TOKEN_TYPES, isKeyword} from './tokenizer.js';


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
        } else if (isKeyword(token)) {
            if (token.type === 'keyword_true' || token.type === 'keyword_false') {
                out.push({
                    type: 'number',
                    value: token.value,
                    numValue: token.type === 'keyword_true' ? 1 : 0,
                    stack: token.stack
                });
            } else {
                error(`SyntaxError: Unrecognized keyword in expression evaluation: '${token.value}'`, token);
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
    return out;
}

export function runExpression(tokens: Token[]): Token<'number'> {
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
                let right = (stack.pop() as Token<'number'>).numValue;
                let left = (stack.pop() as Token<'number'>).numValue;
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
    if (stack.length !== 1) {
        error(`InternalError: runExpression output is ${stack.length} tokens`, tokens[0]);
    }
    let token = stack[0];
    if (token.type !== 'number') {
        error(`InternalError: runExpression output is not a number`, tokens[0]);   
    }
    return token;
}

export function runExpressions(tokens: Token[]): Token[] {
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
                out.push(runExpression(currentExpr));
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
