
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {compile} from './index.js';


let inPath = process.argv[2];
if (!path.isAbsolute(inPath)) {
    inPath = path.join(process.cwd(), inPath);
}

let outPath = inPath;
if (outPath.endsWith('.cap')) {
    outPath = outPath.slice(0, -4) + '.rle';
} else {
    outPath += '.rle';
}

await fs.writeFile(outPath, await compile(inPath));
