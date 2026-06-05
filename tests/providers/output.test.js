const fs = require('fs');
const os = require('os');
const path = require('path');

describe('_outputCredentials', () => {
  const originalCredsFile = process.env.PLAYWRIGHT_CREDS_FILE;
  let stdoutSpy;

  beforeEach(() => {
    jest.resetModules();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    if (originalCredsFile === undefined) {
      delete process.env.PLAYWRIGHT_CREDS_FILE;
    } else {
      process.env.PLAYWRIGHT_CREDS_FILE = originalCredsFile;
    }
  });

  test('writes KEY=value to stdout when PLAYWRIGHT_CREDS_FILE is unset', () => {
    delete process.env.PLAYWRIGHT_CREDS_FILE;
    const { _outputCredentials } = require('../../playwright/lib/output');

    _outputCredentials({ FOO: 'bar', BAZ: 'qux' });

    expect(stdoutSpy).toHaveBeenCalledWith('FOO=bar\nBAZ=qux\n');
  });

  test('writes secure file with mode 0o600 when PLAYWRIGHT_CREDS_FILE is set', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-acg-output-'));
    const credsFile = path.join(tmpDir, 'creds.txt');
    process.env.PLAYWRIGHT_CREDS_FILE = credsFile;
    const { _outputCredentials } = require('../../playwright/lib/output');

    _outputCredentials({ HELLO: 'world' });

    expect(fs.readFileSync(credsFile, 'utf8')).toBe('HELLO=world');
    expect(fs.statSync(credsFile).mode & 0o777).toBe(0o600);
  });
});
