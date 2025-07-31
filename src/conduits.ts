
import {Token, Transform, error, assertTokenType, isKeyword, ERROR_TOKEN_TYPES, createToken} from './tokenizer.js';
import {Pattern} from './pattern.js';


export function replacePipes(tokens: Token[]): Token[] {
    if (!tokens.some(x => x.type === '>')) {
        return tokens;
    }
    let sections: {data: Token[], stack: Token['stack']}[] = [];
    let section: Token[] = [];
    let parenCount = 0;
    for (let token of tokens) {
        if (token.type === '{' || token.type === '[' || token.type === '(') {
            parenCount++;
        } else if (token.type === '}' || token.type === ']' || token.type === ')') {
            parenCount--;
        } else if (token.type === '>' && parenCount === 0) {
            sections.push({data: section, stack: token.stack});
            section = [];
        }
        section.push(token);
    }
    if (sections.length === 0) {
        return section;
    }
    sections.push({data: section, stack: section[0].stack});
    let out: Token[] = [];
    for (let i = sections.length - 1; i >= 0; i--) {
        let {data: section, stack} = sections[i];
        if (section.length === 0) {
            continue;
        } else if (section[0]?.type === '{') {
            out = ([] as Token[]).concat(
                ...section,
                {type: '(', value: '(', stack: structuredClone(stack)},
                ...out,
                {type: ')', value: ')', stack: structuredClone(stack)},
            );
        } else {
            out.push(...section);
        }
    }
    return out;
}


interface CObject {
    rle: Token<'rle'>;
    transform: Token<`keyword_${Transform}`>;
    x: Token<'number'>;
    y: Token<'number'>;
}

interface Conduit {
    type: 'conduit';
    input: CObject;
    outputs: CObject[];
    rle: Token<'rle'>;
    args: (Token | Conduit)[][];
    token: Token<'keyword_conduit'>;
}


const TRANSFORM_COMBINATIONS: {[K in Transform]: {[K in Transform]: Transform}} = {
    'F': {
        'F': 'F',
        'Fx': 'Fx',
        'R': 'R',
        'Rx': 'Rx',
        'B': 'B',
        'Bx': 'Bx',
        'L': 'L',
        'Lx': 'Lx',
    },
    'Fx': {
        'F': 'Fx',
        'Fx': 'F',
        'R': 'Lx',
        'Rx': 'L',
        'B': 'Bx',
        'Bx': 'B',
        'L': 'Rx',
        'Lx': 'R',
    },
    'R': {
        'F': 'R',
        'Fx': 'Rx',
        'R': 'B',
        'Rx': 'Bx',
        'B': 'L',
        'Bx': 'Lx',
        'L': 'F',
        'Lx': 'Fx',
    },
    'Rx': {
        'F': 'Rx',
        'Fx': 'R',
        'R': 'Bx',
        'Rx': 'B',
        'B': 'Lx',
        'Bx': 'L',
        'L': 'Fx',
        'Lx': 'F',
    },
    'B': {
        'F': 'B',
        'Fx': 'Bx',
        'R': 'L',
        'Rx': 'Lx',
        'B': 'F',
        'Bx': 'Fx',
        'L': 'R',
        'Lx': 'Rx',
    },
    'Bx': {
        'F': 'Bx',
        'Fx': 'B',
        'R': 'Lx',
        'Rx': 'L',
        'B': 'Fx',
        'Bx': 'F',
        'L': 'Rx',
        'Lx': 'R',
    },
    'L': {
        'F': 'L',
        'Fx': 'Lx',
        'R': 'F',
        'Rx': 'Fx',
        'B': 'R',
        'Bx': 'Rx',
        'L': 'B',
        'Lx': 'Bx',
    },
    'Lx': {
        'F': 'Lx',
        'Fx': 'L',
        'R': 'Fx',
        'Rx': 'F',
        'B': 'Rx',
        'Bx': 'R',
        'L': 'Bx',
        'Lx': 'B',
    },
}

function parseCObject(tokens: Token[]): CObject {
    let rle = tokens[0];
    assertTokenType(rle, 'rle');
    let out: CObject = {
        rle,
        transform: createToken('keyword_F', 'F'),
        x: createToken('number', '0'),
        y: createToken('number', '0'),
    };
    for (let i = 1; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'number') {
            let yCoord = tokens[++i];
            assertTokenType(yCoord, 'number');
            if (out.x.stack[0].file === '__implicit__') {
                out.x.stack = structuredClone(token.stack);
                out.y.stack = structuredClone(yCoord.stack);
            }
            out.x.numValue += token.numValue;
            out.y.numValue += yCoord.numValue;
        } else if (isKeyword(token) && (token.value === 'F' || token.value === 'Fx' || token.value === 'R' || token.value === 'Rx' || token.value === 'B' || token.value === 'Bx' || token.value === 'L' || token.value === 'Lx')) {
            out.transform.value = TRANSFORM_COMBINATIONS[out.transform.value][token.value];
            if (out.transform.stack[0].file === '__implicit__') {
                out.transform.stack = structuredClone(token.stack);
            }
        } else if (token.type === '\n') {
            continue;
        } else {
            error(`SyntaxError: Unexpected ${ERROR_TOKEN_TYPES[token.type]}`, token);
        }
    }
    return out;
}

function parseConduits(tokens: Token[]): (Token | Conduit)[] {
    let out: (Token | Conduit)[] = [];
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'keyword_conduit') {
            assertTokenType(tokens[++i], '(');
            let args: Token[][] = [];
            let currentArg: Token[] = [];
            let found = false;
            for (i++; i < tokens.length; i++) {
                let token = tokens[i];
                if (token.type === ')') {
                    found = true;
                    break;
                } else if (token.type === ',') {
                    args.push(currentArg);
                    currentArg = [];
                } else {
                    currentArg.push(token);
                }
            }
            if (!found) {
                error(`SyntaxError: Expected right parentheses after left parentheses`, token);
            }
            if (currentArg.length > 0) {
                args.push(currentArg);
            }
            if (args.length !== 3) {
                error(`SyntaxError: Expected 3 arguments to conduit()`, token);
            }
            if (args[args.length - 1].length !== 1) {
                error(`SyntaxError: Last argument to conduit() must be 1 token long`, args[args.length - 1][0]);
            }
            let rle = args[args.length - 1][0];
            assertTokenType(rle, 'rle');
            let input = parseCObject(args[0])
            let outputs = args.slice(1, -1).map(parseCObject);
            args = [];
            currentArg = [];
            let parenToken = tokens[++i];
            assertTokenType(parenToken, '(');
            let parenCount = 1;
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
                error(`SyntaxError: Expected left parentheses`, tokens[tokens.length - 1]);
            }
            if (currentArg.length > 0) {
                args.push(currentArg);
            }
            if (args.length === 0) {
                error(`SyntaxError: Cannot call conduits with 0 arguments`, parenToken);
            }
            out.push({type: 'conduit', rle, input, outputs, args: args.map(parseConduits), token});
        } else {
            out.push(token);
        }
    }
    return out;
}

function runConduit(conduit: Conduit): Token[] {
    if (conduit.args.length !== 1) {
        error(`SyntaxError: Cannot call conduits with more than 1 argument`, conduit.args[1][0].type === 'conduit' ? conduit.args[1][0].token : conduit.args[1][0]);
    }
    return [
        conduit.rle,
        ...runConduits(conduit.args[0], conduit.input.rle),
        conduit.input.transform,
        conduit.input.x,
        conduit.input.y,
        createToken('\n', '\n'),
        conduit.outputs[0].transform,
        conduit.outputs[0].x,
        conduit.outputs[0].y,
    ];
}

function runConduits(tokens: (Token | Conduit)[], conduitInput?: Token<'rle'>): Token[] {
    let out: Token[] = [];
    for (let token of tokens) {
        if (token.type === 'conduit') {
                if (conduitInput) {
                let output = Pattern.fromRLE(token.outputs[0].rle).resizeToFit().toRLE().split('\n').slice(1).join('');
                let input = Pattern.fromRLE(conduitInput).resizeToFit().toRLE().split('\n').slice(1).join('');
                if (output !== input) {
                    console.error(`Warning: Conduit mismatch, expected input of ${input} but got ${output}`);
                }
            }
            out.push(...runConduit(token));
        } else {
            out.push(token);
        }
    }
    return out;
}

export function replaceConduits(tokens: Token[]): Token[] {
    return runConduits(parseConduits(tokens));
}
