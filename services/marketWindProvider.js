const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const DEFAULT_WIND_CLI_PATH = path.join(os.homedir(), '.codex', 'skills', 'wind-mcp-skill', 'scripts', 'cli.mjs');
const DEFAULT_TIMEOUT = Number(process.env.WIND_REQUEST_TIMEOUT || 90000);
const MAX_STDOUT_BYTES = Number(process.env.WIND_MAX_STDOUT_BYTES || 12 * 1024 * 1024);

class WindProviderError extends Error {
    constructor(message, meta) {
        super(message);
        this.name = 'WindProviderError';
        this.meta = meta || {};
    }
}

function parseJson(text, label) {
    try {
        return JSON.parse(text);
    } catch (err) {
        throw new WindProviderError('invalid ' + label + ' json', { reason: err.message, sample: String(text || '').slice(0, 500) });
    }
}

function extractText(result) {
    const content = Array.isArray(result && result.content) ? result.content : [];
    const textItem = content.find(item => item && item.type === 'text' && typeof item.text === 'string');
    return textItem ? textItem.text : '';
}

function normalizeWindResult(stdout) {
    const result = parseJson(stdout, 'wind cli stdout');

    if (result && result.isError) {
        throw new WindProviderError('wind result isError', { result });
    }

    const text = extractText(result);
    const payload = text ? parseJson(text, 'wind content text') : null;

    if (payload && payload.error) {
        throw new WindProviderError('wind payload error', { error: payload.error });
    }

    return {
        result,
        text,
        payload,
        data: payload && payload.data ? payload.data : payload
    };
}

function callWind(serverType, toolName, params, options) {
    const cliPath = process.env.WIND_CLI_PATH || DEFAULT_WIND_CLI_PATH;
    const timeout = Number((options && options.timeout) || DEFAULT_TIMEOUT);
    const startedAt = Date.now();
    const args = [cliPath, 'call', serverType, toolName, JSON.stringify(params || {})];

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {
            cwd: path.dirname(cliPath),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            child.kill('SIGTERM');
            reject(new WindProviderError('wind cli timeout', {
                serverType,
                toolName,
                timeout,
                latencyMs: Date.now() - startedAt
            }));
        }, timeout);

        child.stdout.on('data', chunk => {
            stdout += chunk.toString('utf8');
            if (Buffer.byteLength(stdout) > MAX_STDOUT_BYTES) {
                child.kill('SIGTERM');
            }
        });

        child.stderr.on('data', chunk => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', err => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            reject(new WindProviderError('wind cli spawn failed', {
                serverType,
                toolName,
                reason: err.message,
                cliPath
            }));
        });

        child.on('close', code => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);

            if (code !== 0) {
                reject(new WindProviderError('wind cli exited with code ' + code, {
                    serverType,
                    toolName,
                    code,
                    stderr: stderr.slice(0, 1000),
                    stdout: stdout.slice(0, 1000),
                    latencyMs: Date.now() - startedAt
                }));
                return;
            }

            try {
                const normalized = normalizeWindResult(stdout);
                resolve(Object.assign({
                    serverType,
                    toolName,
                    latencyMs: Date.now() - startedAt
                }, normalized));
            } catch (err) {
                reject(err);
            }
        });
    });
}

function tableFromWindData(data) {
    const columns = Array.isArray(data && data.columns) ? data.columns.map(item => item && item.name).filter(Boolean) : [];
    const rawRows = Array.isArray(data && data.rows) ? data.rows : [];
    const rows = rawRows.map(row => {
        const item = {};
        columns.forEach((column, index) => {
            item[column] = Array.isArray(row) ? row[index] : undefined;
        });
        return item;
    });

    return {
        columns,
        rows,
        total: data && data.excelTotalCount != null ? Number(data.excelTotalCount) : rawRows.length
    };
}

module.exports = {
    callWind,
    tableFromWindData,
    WindProviderError
};
