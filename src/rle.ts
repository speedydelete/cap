
import {Token, error, ERROR_TOKEN_TYPES, assertTokenType, splitByNewlines} from './tokenizer.js';


const RLE_CHARS = '.ABCDEFGHIJKLMNOPQRSTUVWX';

function rleToGrid(token: Token): [number[][], number] {
    let out: number[][] = [];
    let row: number[] = [];
    let num = '';
    for (let char of token.value) {
        if ('0123456789'.includes(char)) {
            num += char;
        } else if (char === 'o' || char === 'b') {
            let run = num === '' ? 1 : parseInt(num);
            let value = char === 'o' ? 1 : 0;
            for (let i = 0; i < run; i++) {
                row.push(value);
            }
            num = '';
        } else if (char === '$') {
            out.push(row);
            if (num !== '') {
                let run = parseInt(num);
                for (let i = 1; i < run; i++) {
                    out.push([]);
                }
            }
            row = [];
            num = '';
        } else if (char === '!') {
            out.push(row);
        } else if (RLE_CHARS.includes(char)) {
            let run = num === '' ? 1 : parseInt(num);
            let value = RLE_CHARS.indexOf(char);
            for (let i = 0; i < run; i++) {
                row.push(value);
            }
            num = '';
        } else {
            error(`SyntaxError: Invalid RLE character: '${char}'`, token);
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

const APGCODE_CHARS = Object.fromEntries(Array.from('0123456789abcdefghijklmnopqrstuv', (char, i) => [char, Array.from(i.toString(2).padEnd(5, '0')).map(x => parseInt(x))]));
const ZERO_STRIP = [0, 0, 0, 0, 0];

let apgcodeCache = new Map<string, [number[][], number]>();

function apgcodeToGrid(token: Token): [number[][], number] {
    let data = token.value.slice(token.value.lastIndexOf('_') + 1);
    let cached = apgcodeCache.get(data);
    if (cached !== undefined) {
        return cached;
    }
    let out: number[][] = [];
    for (let strip of data.split(' ')) {
        let transposed: number[][] = [];
        for (let i = 0; i < strip.length; i++) {
            let char = strip[i];
            if (char in APGCODE_CHARS) {
                transposed.push(APGCODE_CHARS[char]);
            } else if (char === 'w') {
                transposed.push(ZERO_STRIP, ZERO_STRIP);
            } else if (char === 'x') {
                transposed.push(ZERO_STRIP, ZERO_STRIP, ZERO_STRIP);
            } else if (char === 'y') {
                let strNum = strip[++i];
                if (!'0123456789'.includes(strNum)) {
                    error(`SyntaxError: Invalid character after 'y' in apgcode: ${strNum}`, token);
                }
                if ('0123456789'.includes(strip[i + 1])) {
                    strNum += strip[++i];
                }
                let num = parseInt(strNum);
                for (let i = 0; i < num; i++) {
                    transposed.push(ZERO_STRIP);
                }
            }
        }
        for (let y = 0; y < 5; y++) {
            let row: number[] = [];
            for (let x = 0; x < transposed.length; x++) {
                row.push(transposed[x][y]);
            }
            out.push(row);
        }
    }
    let width = Math.max(...out.map(x => x.length));
    for (let row of out) {
        for (let i = row.length; i < width; i++) {
            row.push(0);
        }
    }
    out = out.filter(x => !x.every(y => y === 0));
    while (out.every(x => x[0] === 0)) {
        out = out.map(x => x.slice(1));
        width--;
    }
    while (out.every(x => x[x.length - 1] === 0)) {
        out = out.map(x => x.slice(0, -1));
        width--;
    }
    out = out.filter(x => x.length > 0);
    apgcodeCache.set(data, [out, width]);
    return [out, width];
}

function transpose(pattern: number[][], width: number): [number[][], number] {
    let out: number[][] = Array.from({length: width}, () => (new Array(pattern.length)).fill(0));
    for (let y = 0; y < pattern.length; y++) {
        for (let x = 0; x < width; x++) {
            out[x][y] = pattern[y][x];
        }
    }
    return [out, pattern.length];
}

export function tokensToGrid(data: Token[]): [number[][], number] {
    let lines = splitByNewlines(data);
    let patterns: [number, number, number[][], number][] = [];
    for (let line of lines) {
        if (line.length === 0) {
            continue;
        }
        let pattern: number[][];
        let width: number;
        if (line[0].type === 'rle') {
            [pattern, width] = rleToGrid(line[0]);
            line.shift();
        } else if (line[0].type === '[') {
            let bracketCount = 1;
            let section: Token[] = [];
            let i = 1;
            let lastOpeningBracketToken = line[0];
            while (bracketCount > 0 && i < line.length) {
                let token = line[i++];
                if (token.type === '[') {
                    bracketCount++;
                    lastOpeningBracketToken = token;
                } else if (token.type === ']') {
                    bracketCount--;
                }
                section.push(token);
            }
            if (bracketCount > 0) {
                error('SyntaxError: Unmatched opening bracket', lastOpeningBracketToken);
            }
            section.pop();
            [pattern, width] = tokensToGrid(section);
            line.splice(0, i);
        } else if (line[0].type === 'apgcode') {
            [pattern, width] = apgcodeToGrid(line[0]);
            line.shift();
        } else {
            error(`SyntaxError: Expected RLE, left bracket, or apgcode, got ${ERROR_TOKEN_TYPES[line[0].type]}`, line[0]);
        }
        let shiftX = 0;
        let shiftY = 0;
        let expectY = false;
        for (let token of line) {
            if (token.type === 'number') {
                let num = parseInt(token.value);
                if (expectY) {
                    shiftY += num;
                    expectY = false;
                } else {
                    shiftX += num;
                    expectY = true;
                }
            } else if (expectY) {
                assertTokenType(token, 'number');
            } else if (token.type === 'transform') {
                for (let char of token.value) {
                    if (char === 'R') {
                        [pattern, width] = transpose(pattern, width);
                        pattern = pattern.map(row => row.reverse());
                    } else if (char === 'L') {
                        [pattern, width] = transpose(pattern, width);
                        pattern = pattern.reverse();
                    } else if (char === 'B') {
                        pattern = pattern.map(row => row.reverse()).reverse();
                    } else if (char === 'X') {
                        pattern = pattern.reverse();
                    } else if (char === 'Y') {
                        pattern = pattern.map(row => row.reverse());
                    } else if (char === 'D') {
                        [pattern, width] = transpose(pattern, width);
                    } else if (char === 'A') {
                        pattern = pattern.map(row => row.reverse());
                        [pattern, width] = transpose(pattern, width);
                        pattern = pattern.map(row => row.reverse());
                    } else if (char === 'T') {
                        [pattern, width] = transpose(pattern, width);
                    } else if (char !== 'N') {
                        error('SyntaxError: Invalid transformation', token);
                    }
                }
            } else if (token.type === '\n') {
                continue;
            } else {
                console.log(token);
                error(`SyntaxError: Unexpected ${ERROR_TOKEN_TYPES[token.type]}`, token);
            }
        }
        if (expectY) {
            error('SyntaxError: Missing Y coordinate after X coordinate', data[data.length - 1]);
        }
        patterns.push([shiftX, shiftY, pattern, width]);
    }
    let grid: number[][] = [];
    let gridWidth = 0;
    let offsetX = -Math.min(...patterns.map(x => x[0]));
    let offsetY = -Math.min(...patterns.map(x => x[1]));
    for (let [shiftX, shiftY, pattern, width] of patterns) {
        shiftX += offsetX;
        shiftY += offsetY;
        if (shiftY + pattern.length >= grid.length) {
            for (let i = grid.length - 1; i < shiftY + pattern.length; i++) {
                grid.push((new Array(gridWidth)).fill(0));
            }
        }
        if (shiftX + width >= gridWidth) {
            for (let row of grid) {
                for (let i = gridWidth - 1; i < shiftX + width; i++) {
                    row.push(0);
                }
            }
            gridWidth = shiftX + width;
        }
        for (let y = 0; y < pattern.length; y++) {
            for (let x = 0; x < width; x++) {
                grid[y + shiftY][x + shiftX] = pattern[y][x];
            }
        }
    }
    return [grid, gridWidth];
}

export function gridToRLE([grid, width]: [number[][], number], rule: string): string {
    let beforeRLE = '';
    for (let row of grid) {
        if (row !== undefined) {
            for (let item of row) {
                if (item === 0) {
                    beforeRLE += 'b';
                } else if (item === 1) {
                    beforeRLE += 'o';
                } else {
                    beforeRLE += RLE_CHARS[item];
                }
            }   
        }
        beforeRLE += '$';
    }
    beforeRLE = beforeRLE.split('$').map(x => x.replace(/b+$/, '')).join('$').replaceAll(/^\$+|\$+$/g, '');
    let out =  `x = ${width}, y = ${grid.length}, rule = ${rule}\n`;
    if (beforeRLE.length === 0) {
        return out + '!';
    }
    let runLength = 1;
    let runChar = beforeRLE[0];
    for (let char of beforeRLE.slice(1)) {
        if (runChar === char) {
            runLength++;
        } else {
            if (runLength === 1) {
                out += runChar;
            } else {
                out += runLength + runChar;
            }
            runChar = char;
            runLength = 1;
        }
        if (out.lastIndexOf('\n') < -60) {
            out += '\n';
        }
    }
    if (runLength === 1) {
        out += runChar;
    } else {
        out += runLength + runChar;
    }
    return out + '!\n';
}
