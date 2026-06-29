#!/usr/bin/env node
// Postinstall script: patch AsyncNgrok.js to use system ngrok v3
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', '@expo', 'cli', 'build', 'src', 'start', 'server', 'AsyncNgrok.js');

if (!fs.existsSync(target)) {
  console.log('[patch-ngrok] AsyncNgrok.js not found, skipping');
  process.exit(0);
}

let src = fs.readFileSync(target, 'utf8');

// Replace hardcoded Expo ngrok token with user's token
src = src.replace(
  /authToken:\s*'[A-Za-z0-9_]+'/,
  "authToken: '3Fk4HLUubHn0SxiisuL6tbuiSom_41ehdA3NACxFaNNEZ8F3m'"
);

// Increase timeout from 10s to 30s
src = src.replace(
  /TUNNEL_TIMEOUT\s*=\s*\d+\s*\*\s*\d+\s*;/,
  'TUNNEL_TIMEOUT = 30 * 1000;'
);

// Replace _connectToNgrokAsync + _getConnectionPropsAsync + connectToNgrokInternalAsync
const marker = 'async _getConnectionPropsAsync()';
const endMarker = 'async getProjectRandomnessAsync()';

const startIdx = src.indexOf('async _connectToNgrokAsync(');
const endIdx = src.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `    /** Exposed for testing. */ async _connectToNgrokAsync(options = {}, attempts = 0) {
        const instance = await this.resolver.resolveAsync({ shouldPrompt: false, autoInstall: false });
        const results = await (0, _delay.resolveWithTimeout)(()=>this.connectToNgrokInternalAsync(instance, attempts), {
            timeout: options.timeout ?? TUNNEL_TIMEOUT,
            errorMessage: 'ngrok tunnel took too long to connect.'
        });
        if (typeof results === 'string') {
            return results;
        }
        throw new _errors.CommandError('NGROK_CONNECT', 'Failed to create ngrok tunnel.');
    }
    async _getConnectionPropsAsync() {
        return {};
    }
    async connectToNgrokInternalAsync(instance, attempts = 0) {
        try {
            const configPath = _path().join((0, _UserSettings.getSettingsDirectory)(), 'ngrok.yml');
            debug('Global config path:', configPath);

            const { spawn } = require('child_process');
            const ngrokBin = '/opt/homebrew/bin/ngrok';
            const ngrok = spawn(ngrokBin, ['http', String(this.port), '--log=stdout', '--config=' + configPath], { windowsHide: true });

            const apiUrl = await new Promise((resolve, reject) => {
                let settled = false;
                ngrok.stdout.on('data', (data) => {
                    const msg = data.toString().trim();
                    const m = msg.match(/starting web service.*addr=(\\d+\\.\\d+\\.\\d+\\.\\d+:\\d+)/);
                    if (m && !settled) { settled = true; resolve('http://' + m[1]); }
                });
                ngrok.stderr.on('data', (data) => {
                    if (!settled) { settled = true; reject(new Error(data.toString().substring(0, 500))); }
                });
                ngrok.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
                setTimeout(() => { if (!settled) { settled = true; reject(new Error('ngrok did not start')); } }, 15000);
            });
            debug('ngrok web service at:', apiUrl);

            const http = require('http');
            for (let i = 0; i < 40; i++) {
                await (0, _delay.delayAsync)(500);
                try {
                    const body = await new Promise((res, rej) => {
                        http.get(apiUrl + '/api/tunnels', (r) => {
                            let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d));
                        }).on('error', rej);
                    });
                    const tunnels = JSON.parse(body).tunnels;
                    if (tunnels.length > 0) {
                        debug('Tunnel URL:', tunnels[0].public_url);
                        return tunnels[0].public_url;
                    }
                } catch (e) { /* not ready yet */ }
            }
            throw new Error('ngrok tunnel not created within 20s');
        } catch (error) {
            throw new _errors.CommandError('NGROK_CONNECT', error.toString() + _chalk().default.gray('\\nCheck the Ngrok status page for outages: https://status.ngrok.com/'));
        }
    }
    `;

  src = src.substring(0, startIdx) + replacement + src.substring(endIdx);
  fs.writeFileSync(target, src, 'utf8');
  console.log('[patch-ngrok] Patched AsyncNgrok.js successfully');
} else {
  console.log('[patch-ngrok] Could not find insertion points, skipping');
}
