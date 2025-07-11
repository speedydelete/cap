
import {Token, error, assertTokenType, splitByNewlines} from './tokenizer.js';


export class Scope {

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
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'variable') {
            out.push(...scope.get(token, force));
        } else {
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
            funcScope.set(args[i], argInputs[i]);
        }
        section = replaceVariables(section, funcScope);
    } else if (line[i + 1].type === '(') {
        if (line[i + 2].type === ')') {
            i += 2;
        } else {
            error('ArgumentError: Function takes 0 arguments but at least 1 was provided', line[i + 1]);
        }
    }
    return [section, i];
}

export function replaceVariables(tokens: Token[], scope: Scope = new Scope()): Token[] {
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
    return out;
}
