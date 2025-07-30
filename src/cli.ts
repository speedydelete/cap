
import {argv as allArgv, join, isAbsolute, cwd, writeFile, exit} from './apis.js';
import {compile, CompilerOptions} from './index.js';


const ARGS: {[K in keyof CompilerOptions]: boolean extends CompilerOptions[K] ? {type: 'boolean', arg: string, short?: string, desc: string} : {type: 'string', arg: string, desc: string}} = {
    allowJSImports: {
        type: 'boolean',
        arg: 'js',
        short: 'j',
        desc: 'allow importing from JavaScript files',
    },
    debugTokens: {
        type: 'boolean',
        arg: 'dt',
        desc: 'show debug information',
    },
    debugReplaced: {
        type: 'boolean',
        arg: 'dr',
        desc: 'show debug information',
    },
    dontLogToConsole: {
        type: 'boolean',
        arg: 'log',
        short: 'l',
        desc: 'don\'t call native console methods'
    }
};

function printVersion(): never {
    console.log('capc 1.0.0');
    exit(1);
}

function printHelp(): never {
    console.log('capc - CAP compiler');
    console.log('\nFor documentation see https://github.com/speedydelete/cap');
    console.log('\nOptions:');
    console.log('    -h, --help - prints this message');
    console.log('    -v, --version - print the version');
    for (let arg of Object.values(ARGS)) {
        console.log(`    ${'short' in arg ? arg.short + ', ' : ''}${arg.arg} - ${arg.desc}`);
    }
    exit(0);
}

let args = allArgv.slice(2);
let inputPath: string | null = null;
let options: CompilerOptions = {};
for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    if (arg.startsWith('-')) {
        if (arg.startsWith('--')) {
            if (arg === '--help') {
                printHelp();
            } else if (arg === '--version') {
                printVersion();
            }
            arg = arg.slice(2);
            let found =false;
            for (let [key, spec] of Object.entries(ARGS)) {
                if (arg === spec.arg) {
                    // @ts-ignore
                    if (spec.type === 'string') {
                        let value = args[++i];
                        if (value === undefined) {
                            console.error(`capc: expected argument after '--${arg}'`);
                            exit(1);
                        }
                        // @ts-ignore
                        options[key] = args[i++];
                    } else {
                        // @ts-ignore
                        options[key] = true;
                    }
                    found = true;
                    break;
                } else if (spec.type === 'boolean' && arg.startsWith('--no-' + spec.arg)) {
                    // @ts-ignore
                    options[key] = false;
                    found = true;
                    break;
                }
            }
            if (!found) {
                console.error(`capc: unrecognized argument: '--${arg}'`);
                exit(1);
            }
        } else {
            if (arg.includes('h')) {
                printHelp();
            } else if (arg.includes('v')) {
                printVersion();
            }
            for (let [key, spec] of Object.entries(ARGS)) {
                if (spec.type === 'boolean' && spec.short) {
                    if (arg.includes(spec.short)) {
                        // @ts-ignore
                        options[key] = true;
                    }
                }
            }
        }
    } else {
        inputPath = arg;
        options.argv = args.slice(i + 1);
        break;
    }
}

if (inputPath === null) {
    throw new Error(`capc: expected 1 positional argument, got 0`);
}


if (!isAbsolute(inputPath)) {
    inputPath = join(cwd(), inputPath);
}

let outputPath = inputPath;
if (outputPath.endsWith('.cap')) {
    outputPath = outputPath.slice(0, -4) + '.rle';
} else {
    outputPath += '.rle';
}

await writeFile(outputPath, await compile(inputPath, options));
