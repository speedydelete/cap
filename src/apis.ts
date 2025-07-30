
export let join: (...paths: string[]) => string;
export let dirname: (path: string) => string;
export let isAbsolute: (path: string) => boolean;
export let readFile: (path: string) => Promise<string>;
export let writeFile: (path: string, data: string) => Promise<void>;
export let exists: (path: string) => boolean;
export let env: {[key: string]: string | undefined};
export let argv: string[];
export let dir: string;
export let exit: (code: number) => never;
export let cwd: () => string;
export let createRequire: (path: string) => ((path: string) => Promise<any>);

let stdout = '';
let stderr = '';
export let getStdout = () => stdout;
export let getStderr = () => stderr;
export let clearStdout = () => {stdout = ''};
export let clearStderr = () => {stderr = ''};
let formatter: (data: any) => string = JSON.stringify.bind(JSON);
function formatData(data: any[]) {
    return data.map(x => typeof x === 'string' ? x : formatter(x)).join(' ') + '\n';
}
let logToConsole = true;
export let console = {
    log(...data: any[]) {
        stdout += formatData(data);
        if (logToConsole) {
            globalThis.console.log(...data);
        }
    },
    error(...data: any[]) {
        stderr += formatData(data);
        if (logToConsole) {
            globalThis.console.error(...data);
        }
    }
};
export let disableLoggingToConsole: () => void = () => logToConsole = false;

if (typeof window === 'object' && window === globalThis) {
    let files = new Map<string, string>();
    function normalize(path: string): string {
        let stack: string[] = [];
        for (let section of path.split('/')) {
            if (section === '' || section === '.') {
                continue;
            } else if (section === '..') {
                stack.pop();
            } else {
                stack.push(section);
            }
        }
        return stack.join('/');
    }
    function toAbsolute(path: string): string {
        if (!path.startsWith('/')) {
            path = cwd() + path;
        }
        return normalize(path);
    }
    join = (...paths) => normalize(paths.join('/'));
    dirname = path => path.slice(0, path.lastIndexOf('/'));
    isAbsolute = path => path.startsWith('/');
    readFile = async path => {
        let out = files.get(toAbsolute(path));
        if (out === undefined) {
            throw new Error(`File '${path}' does not exist`);
        }
        return out;
    };
    writeFile = async (path, data) => {
        files.set(toAbsolute(path), data);
    };
    env = {};
    argv = [];
    dir = '/lib';
    cwd = () => '/';
    function _createRequire<T extends boolean>(startPath: string, sync: T): (path: string) => (T extends true ? any : Promise<any>) {
        return function(path) {
            let fullPath = toAbsolute(join(startPath, path));
            let code: string | undefined;
            if (path.startsWith('http://') || path.startsWith('https://')) {
                if (sync) {
                    let req = new XMLHttpRequest();
                    req.open('GET', path, false);
                    req.send(null);
                    code = req.responseText;
                } else {
                    return import(path);
                }
            } else {
                code = files.get(fullPath);
            }
            if (code === undefined) {
                throw new Error(`Module '${path}' does not exist (imported from '${toAbsolute(startPath)}')`);
            }
            if ((code.includes('exports.') || code.includes('module.exports'))) {
                let stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, '').replace(/`(?:\\[\s\S]|[^\\`])*`/g, '');
                if (stripped.includes('exports.') || stripped.includes('module.exports')) {
                    let exports = {};
                    let module = {
                        exports,
                        createRequire(path2: string) {
                            return _createRequire(join(path, path2), true);
                        },
                    };
                    let require = _createRequire(fullPath, true);
                    let index = fullPath.lastIndexOf('/');
                    let __dirname = fullPath.slice(0, index);
                    let __filename = fullPath.slice(index);
                    let func = new Function('exports', 'module', 'require', '__dirname', '__filename', code + ';\n\n;return exports;');
                    return func(exports, module, require,  __dirname, __filename);
                }
            }

            let blob = new Blob([code], {type: 'text/javascript'});
            let url = URL.createObjectURL(blob);
            try {
                return import(url);
            } finally {
                URL.revokeObjectURL(url);
            }
        };
    }
    createRequire = path => _createRequire(path, false);
} else {
    ({join, dirname, isAbsolute} = await import('node:path'));
    let fs = await import('node:fs/promises');
    readFile = async (path: string) => (await fs.readFile(path)).toString();
    writeFile = fs.writeFile;
    exists = (await import('node:fs')).existsSync;
    ({env, argv, exit, cwd} = process);
    dir = import.meta.dirname;
    let nodeCreateRequire = (await import('node:module')).createRequire;
    createRequire = path => {
        let require = nodeCreateRequire(path);
        return async path2 => {
            try {
                return require(path2);
            } catch {
                if (isAbsolute(path2)) {
                    try {
                        return await import(path2);
                    } catch (error) {
                        return await import('file:///' + path2);
                    }
                } else {
                    return await import(join(path, path2));
                }
            }
        }
    };
    formatter = (await import('node:util')).inspect;
}
