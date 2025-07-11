
import {tokenize} from './tokenizer.js';
import {replaceVariables} from './variables.js';
import {Pattern} from './pattern.js';

export * as tokenizer from './tokenizer.js';
export * as variables from './variables.js';
export * as rle from './pattern.js';


export async function compile(filePath: string): Promise<string> {
    let {tokens, rule} = await tokenize(filePath, true);
    tokens = replaceVariables(tokens);
    return Pattern.fromTokens(tokens).toRLE(rule);
}
