
import * as fs from 'node:fs/promises';
import {join, resolve} from 'node:path';


let path = process.argv[2];

function extractLines(code: string): string[] {
    let out: string[] = [];
    let braces = 0;
    let wasBackslash = false;
    for (let line of code.split('\n')) {
        line = line.trim();
        if (line.endsWith('\\')) {
            wasBackslash = true;
        }
        if (line.includes('{') || line.includes('}')) {
            for (let char of line) {
                if (char === '{') {
                    braces++;
                } else {
                    braces--;
                }
            }
            if (braces < 0) {
                throw new Error('Mismatched braces');
            }
        }
        if (wasBackslash) {
            out[out.length - 1] += line;
        } else if (braces > 0) {
            out[out.length - 1] += '\n' + line;
        } else {
            out.push(line);
        }
    }
    if (braces > 0) {
        throw new Error('Mismatched braces');
    }
    return out;
}

async function replaceIncludes(lines: string[]): Promise<string[]> {
    let out: string[] = [];
    for (let line of lines) {
        if (line.startsWith('include ')) {
            let file = line.slice('include '.length);
            if (!file.startsWith('/')) {
                file = join(path, file);
            }
            let code = (await fs.readFile(file)).toString();
            for (let line of extractLines(code)) {
                out.push(line);
            }
        } else {
            out.push(line);
        }
    }
    return out;
}

function extractRule(lines: string[]): [string[], string] {
    let match: RegExpMatchArray | null;
    let out: string[] = [];
    let rule: null | string = null;
    for (let line of lines) {
        if (match = line.match(/^rule\s*=\s*(.+)$/)) {
            rule = match[1];
        } else {
            out.push(line);
        }
    }
    if (rule === null) {
        throw new Error('Patterns must have a rule');
    }
    return [out, rule];
}


const VARIABLE_CHARS = 'abcedefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$!';

function replaceVars([lines, rule]: [string[], string]): [string[], string] {
    let vars = new Map<string, string>();
    let out: string[] = [];
    for (let line of lines) {
        let words: [string, boolean][] = [];
        let parsingVariable = false;
        for (let char of line) {
            if (VARIABLE_CHARS.includes(char)) {
                if (parsingVariable) {
                    words[words.length - 1][0] += char;
                } else {
                    words.push([char, true]);
                }
                parsingVariable = true;
            } else if (char === ' ' || char === '\t') {
                continue;
            } else {
                words.push([char, false]);
                parsingVariable = false;
            }
        }
        if (words.length === 0) {
            continue;
        } else if (words.length > 1 && words[1][0] === '=') {
            if (!words[0][1] || words[0][0].match(/[A-Z$!]/)) {
                throw new Error('Variable names can only contain lowercase letters, numbers, and underscores');
            } else if ('0123456789'.includes(words[0][0][0])) {
                throw new Error('Variable names cannot start with numbers');
            }
            vars.set(words[0][0], words.slice(2).map(word => word[0]).join(' '));
        } else {
            let line: string[] = [];
            for (let i = 0; i < words.length; i++) {
                let [word, isVariable] = words[i];
                if (isVariable) {
                    if (!word.match(/[A-Z$!]/)) {
                        let value = vars.get(word);
                        if (value === undefined) {
                            throw new Error(`Variable '${word}' is not defined`);
                        }
                        line.push(value);
                    } else {
                        line.push(word);
                    }
                } else {
                    throw new Error(`Unexpected character: '${word}'`);
                }
            }
            out.push(line.join(' '));
        }
    }
    return [out, rule];
}


function rleToArray(rle: string): [number[][], number] {
    let out: number[][] = [];
    let row: number[] = [];
    let num = '';
    for (let char of rle) {
        if ('0123456789'.includes(char)) {
            num += char;
        } else if (char === 'o' || char === 'b') {
            let run = num === '' ? 1 : parseInt(num);
            let value = char === 'o' ? 1 : 0;
            for (let i = 0; i < run; i++) {
                row.push(value);
            }
        } else if (char === '$') {
            out.push(row);
            row = [];
        } else if (char === '!') {
            out.push(row);
        } else {
            throw new Error(`Invalid RLE character: '${char}'`);
        }
    }
    let width = Math.max(...out.map(x => x.length));
    for (let row of out) {
        while (row.length < width) {
            row.push(0);
        }
    }
    return [out, width];
}

function transpose(pattern: number[][], width: number): [number[][], number] {
    let out: number[][] = (new Array(width)).map(x => x.fill(pattern.length));
    for (let y = 0; y < pattern.length; y++) {
        for (let x = 0; x < width; x++) {
            out[x][y] = pattern[y][x];
        }
    }
    return [out, pattern.length];
}

function generateRLE([data, rule]: [string[], string]): string {
    let patterns: [number, number, number[][], number][] = [];
    for (let _line of data) {
        let line = _line.split(' ');
        let [pattern, width] = rleToArray(line[0]);
        let shiftX = 0;
        let shiftY = 0;
        let expectY = false;
        for (let part of data.slice(1)) {
            if (part.match(/^-?\d+$/)) {
                let num = parseInt(part);
                if (expectY) {
                    shiftY += num;
                    expectY = false;
                } else {
                    shiftX += num;
                    expectY = true;
                }
            } else if (expectY) {
                throw new Error(`Expected number, got '${part}'`);
            } else {
                for (let char of part) {
                    if (char === 'R') {
                        [pattern, width] = transpose(pattern, width);
                        pattern.forEach(row => row.reverse());
                    } else if (char === 'L') {
                        [pattern, width] = transpose(pattern, width);
                        pattern.reverse();
                    } else if (char === 'F') {
                        pattern.forEach(row => row.reverse());
                        pattern.reverse();
                    } else if (char === 'H') {
                        pattern.forEach(row => row.reverse());
                    } else if (char === 'V') {
                        pattern.reverse();
                    } else if (char === 'D') {
                        [pattern, width] = transpose(pattern, width);
                    } else if (char === 'A') {
                        pattern.forEach(row => row.reverse());
                        [pattern, width] = transpose(pattern, width);
                        pattern.forEach(row => row.reverse());
                    } else {
                        throw new Error(`Invalid transformation: '${char}'`);
                    }
                }
            }
        }
        if (expectY) {
            throw new Error('Missing Y coordinate after X coordinate');
        }
        patterns.push([shiftX, shiftY, pattern, width]);
    }
    let grid: number[][] = [];
    let offsetX = -Math.min(...patterns.map(x => x[0]));
    let offsetY = -Math.min(...patterns.map(x => x[0]));
    for (let [shiftX, shiftY, pattern, width] of patterns) {
        shiftX += offsetX;
        shiftY += offsetY;
        for (let y = 0; y < pattern.length; y++) {
            for (let x = 0; x < width; x++) {
                if (grid[y + shiftY] === undefined) {
                    grid[y + shiftY] = [];
                }
                grid[y + shiftY][x + shiftX] = pattern[y][x];
            }
        }
    }
    let out = `x = ${Math.max(...grid.map(x => x.length))}, y = ${grid.length}, rule = ${rule}\n`;
    for (let row of grid) {
        for (let item of row) {
            if (item) {
                out += 'o';
            } else {
                out += 'b';
            }
            if (out.lastIndexOf('\n') <= -60) {
                out += '\n';
            }
        }
        out += '$';
    }
    return out.slice(0, -1) + '!';
}


let outPath = path;
if (outPath.endsWith('.cap')) {
    outPath = outPath.slice(0, -4) + '.rle';
}
let code = (await fs.readFile(path)).toString();
code = generateRLE(replaceVars(extractRule(await replaceIncludes(extractLines(code)))));
await fs.writeFile(outPath, code)
