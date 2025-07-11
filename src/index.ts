
import {tokenize} from './tokenizer.js';
import {replaceVariables} from './variables.js';
import {tokensToGrid, gridToRLE} from './rle.js';

export * as tokenizer from './tokenizer.js';
export * as variables from './variables.js';
export * as rle from './rle.js';


export async function compile(filePath: string): Promise<string> {
    let {tokens, rule} = await tokenize(filePath, true);
    tokens = replaceVariables(tokens);
    return gridToRLE(tokensToGrid(tokens), rule);
}
