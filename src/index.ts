
import {tokenize} from './tokenizer.js';
import {replaceVariables} from './variables.js';
import {Pattern} from './pattern.js';
import {console, disableLoggingToConsole} from './apis.js';

export * as tokenizer from './tokenizer.js';
export {clearFileCache} from './tokenizer.js';
export * as variables from './variables.js';
export * as rle from './pattern.js';
export {getStdout, getStderr, clearStdout, clearStderr} from './apis.js';


export interface CompilerOptions {
    argv?: string[];
    allowJSImports?: boolean;
    debugTokens?: boolean;
    debugReplaced?: boolean;
    dontLogToConsole?: boolean;
}

export async function compile(filePath: string, options: CompilerOptions = {}): Promise<string> {
    if (options.dontLogToConsole) {
        disableLoggingToConsole();
    }
    let tokens = await tokenize(filePath, options.allowJSImports);
    if (options.debugTokens) {
        console.log(tokens.map(x => x.value).join(' ').replaceAll('\n ', '\n'));
    }
    tokens = replaceVariables(tokens);
    if (options.debugReplaced) {
        console.log(tokens.map(x => x.value).join(' ').replaceAll('\n ', '\n'));
    }
    return Pattern.fromTokens(tokens).toRLE();
}
