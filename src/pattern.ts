
import {Token, error, ERROR_TOKEN_TYPES, assertTokenType, splitByNewlines} from './tokenizer.js';
import {runPattern} from './runner.js';


const RLE_CHARS = '.ABCDEFGHIJKLMNOPQRSTUVWX';

const APGCODE_CHARS = Object.fromEntries(Array.from('0123456789abcdefghijklmnopqrstuv', (char, i) => [char, Array.from(i.toString(2).padEnd(5, '0')).map(x => parseInt(x))]));
const ZERO_STRIP = [0, 0, 0, 0, 0];

let apgcodeCache = new Map<string, Pattern>();


export class Pattern {

    data: number[][];
    height: number;
    width: number;

    constructor(data: number[][] | Pattern = []) {
        if (data instanceof Pattern) {
            this.data = data.data;
            this.height = data.height;
            this.width = data.width;
        } else {
            this.data = data;
            this.height = data.length;
            this.width = data.length === 0 ? 0 : Math.max(...data.map(x => x.length));
        }
    }

    get(x: number, y: number): number {
        return this.data[y]?.[x] ?? 0;
    }

    set(x: number, y: number, value: number): this {
        this.ensureSize(y + 1, x + 1);
        this.data[y][x] = value;
        return this;
    }

    copy(): Pattern {
        return new Pattern(this);
    }

    ensureSize(height: number, width: number): this {
        if (width > this.width) {
            for (let row of this.data) {
                for (let i = row.length; i < width; i++) {
                    row.push(0);
                }
            }
            this.width = width;
        }
        if (height > this.height) {
            for (let i = this.height; i < height; i++) {
                this.data.push(Array.from({length: this.width}, () => 0));
            }
            this.height = height;
        }
        return this;
    }

    resize(height: number, width: number): this {
        this.ensureSize(height, width);
        this.height = height;
        this.width = width;
        return this;
    }

    setFrom(pattern: Pattern, offsetX: number = 0, offsetY: number = 0, overwrite: boolean = true): this {
        this.ensureSize(offsetY + pattern.height, offsetX + pattern.width);
        for (let y = 0; y < pattern.height; y++) {
            for (let x = 0; x < pattern.width; x++) {
                if (overwrite || !this.data[y + offsetY][x + offsetX]) {
                    this.data[y + offsetY][x + offsetX] = pattern.get(x, y);
                }
            }
        }
        return this;
    }

    resizeToFit(): this {
        while (this.data[0].every(x => x === 0)) {
            this.data.shift();
            this.height--;
        }
        while (this.data[this.data.length - 1].every(x => x === 0)) {
            this.data.pop();
            this.height--;
        }
        while (this.data.every(row => row[0] === 0)) {
            this.data.forEach(row => row.shift());
            this.width--;
        }
        while (this.data.every(row => row[row.length - 1] === 0)) {
            this.data.forEach(row => row.pop());
            this.width--;
        }
        return this;
    }

    offsetBy(offsetX: number, offsetY: number): this {
        let newData = Array.from({length: this.height + offsetY}, () => Array.from({length: this.width + offsetX}).fill(0) as number[]);
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                newData[y + offsetY][x + offsetX] = this.get(x, y);
            }
        }
        this.data = newData;
        this.height += offsetX;
        this.width += offsetY;
        return this;
    }

    addRow(row: number[]): void {
        if (row.length > this.width) {
            this.resize(this.height, row.length);
        } else if (row.length < this.width) {
            for (let i = row.length; i < this.width; i++) {
                row.push(0);
            }
        }
        this.data.push(row);
        this.height++;
    }
    
    transpose(): this {
        this.data = Array.from({length: this.width}, (_, i) => this.data.map(row => row[i]));
        [this.height, this.width] = [this.width, this.height];
        return this;
    }

    reverseRows(): this {
        this.data.reverse();
        return this;
    }

    reverseColumns(): this {
        this.data.forEach(row => row.reverse());
        return this;
    }

    applyTransform(token: Token<'transform'>): this {
        for (let char of token.value) {
            if (char === 'R') {
                this.transpose().reverseRows();
            } else if (char === 'L') {
                this.transpose().reverseColumns();
            } else if (char === 'B') {
                this.reverseRows().reverseColumns();
            } else if (char === 'X') {
                this.reverseRows();
            } else if (char === 'Y') {
                this.reverseColumns();
            } else if (char === 'T' || char === 'D') {
                this.transpose();
            } else if (char === 'A') {
                this.reverseRows().transpose().reverseRows();
            } else if (char !== 'N') {
                error('SyntaxError: Invalid transformation', token);
            }
        }
        return this;
    }

    static fromRLE(token: Token<'rle'>): Pattern {
        let out = new Pattern();
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
                out.addRow(row);
                if (num !== '') {
                    let run = parseInt(num);
                    for (let i = 1; i < run; i++) {
                        out.addRow([]);
                    }
                }
                row = [];
                num = '';
            } else if (char === '!') {
                out.addRow(row);
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
        return out;
    }

    static fromApgcode(token: Token<'apgcode'>): Pattern {
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
        let pattern = (new Pattern(out)).resizeToFit();
        apgcodeCache.set(token.value, pattern);
        return pattern;
    }

    static fromTokens(tokens: Token[]): Pattern {
        let lines = splitByNewlines(tokens);
        let patterns: [number, number, Pattern][] = [];
        let rule: string = 'B3/S23';
        for (let line of lines) {
            if (line.length === 0) {
                continue;
            }
            let pattern: Pattern;
            if (line[0].type === 'rle') {
                pattern = Pattern.fromRLE(line[0]);
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
                pattern = Pattern.fromTokens(section);
                line.splice(0, i);
            } else if (line[0].type === 'apgcode') {
                pattern = Pattern.fromApgcode(line[0]);
                line.shift();
            } else if (line[0].type === 'rule') {
                rule = line[0].rule;
                continue;
            } else {
                error(`SyntaxError: Expected RLE, left bracket, apgcode, or rule statement, got ${ERROR_TOKEN_TYPES[line[0].type]}`, line[0]);
            }
            let shiftX = 0;
            let shiftY = 0;
            for (let i = 0; i < line.length; i++) {
                let token = line[i];
                if (token.type === 'number') {
                    let yCoord = line[++i];
                    assertTokenType(yCoord, 'number');
                    shiftX += token.numValue;
                    shiftY += yCoord.numValue;
                } else if (token.type === 'transform') {
                    pattern.applyTransform(token);
                } else if (token.type === '@') {
                    let generations = line[++i];
                    assertTokenType(generations, 'number');
                    pattern = runPattern(pattern, generations.numValue, rule, token);
                } else if (token.type === '\n') {
                    continue;
                } else {
                    error(`SyntaxError: Unexpected ${ERROR_TOKEN_TYPES[token.type]}`, token);
                }
            }
            patterns.push([shiftX, shiftY, pattern]);
        }
        let out = new Pattern();
        let offsetX = -Math.min(...patterns.map(x => x[0]));
        let offsetY = -Math.min(...patterns.map(x => x[1]));
        for (let [shiftX, shiftY, pattern] of patterns) {
            out.setFrom(pattern, shiftX + offsetX, shiftY + offsetY, false);
        }
        return out;
    }

    toRLE(rule: string): string {
        let beforeRLE = '';
        for (let row of this.data) {
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
        let out =  `x = ${this.width}, y = ${this.height}, rule = ${rule}\n`;
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

}
