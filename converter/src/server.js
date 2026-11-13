import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename, extname } from 'node:path';
import { promisify } from 'node:util';
import { Storage } from '@google-cloud/storage';

const run = promisify(execFile);
const storage = new Storage();

const PORT = Number(process.env.PORT ?? 8080);

/**
 * LibreOffice can sit there forever on a deck it cannot make sense of, and a
 * hung conversion would hold a Cloud Run instance until the request timeout.
 * Ten minutes is far more than a real deck needs and far less than forever.
 */
const CONVERT_TIMEOUT_MS = 10 * 60 * 1000;

/** Everything this service will open. Anything else is a bad request. */
const ACCEPTED = new Set([
  '.pptx',
  '.ppt',
  '.odp',
  '.doc',
  '.docx',
  '.odt',
]);

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // Nothing legitimate is anywhere near this; it is only keys and a bucket.
      if (raw.length > 10_000) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Body is not JSON'));
      }
    });
    req.on('error', reject);
  });

/**
 * Convert one object in a bucket and write the PDF to another key in the same
 * bucket.
 *
 * The file never touches this service's own storage for longer than the
 * conversion: it is pulled into a throwaway directory, converted, pushed back
 * and deleted, including when the conversion fails.
 */
async function convert({ bucket, sourceKey, targetKey }) {
  const extension = extname(sourceKey).toLowerCase();
  if (!ACCEPTED.has(extension)) {
    const error = new Error(`Cannot convert a ${extension || 'file with no extension'}`);
    error.status = 400;
    throw error;
  }

  const work = await mkdtemp(join(tmpdir(), 'convert-'));
  try {
    const source = join(work, basename(sourceKey));
    await storage.bucket(bucket).file(sourceKey).download({ destination: source });

    // -env:UserInstallation keeps LibreOffice's profile inside the throwaway
    // directory. Without it two conversions on the same instance fight over
    // ~/.config and the second one exits without producing anything.
    await run(
      'soffice',
      [
        '--headless',
        '--norestore',
        `-env:UserInstallation=file://${join(work, 'profile')}`,
        '--convert-to',
        'pdf:impress_pdf_Export',
        '--outdir',
        work,
        source,
      ],
      { timeout: CONVERT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
    );

    // soffice names the output after the input and reports success either way,
    // so the only way to know it worked is to look for the file.
    const produced = (await readdir(work)).find((name) => name.endsWith('.pdf'));
    if (!produced) {
      throw new Error('LibreOffice produced no PDF');
    }

    await storage.bucket(bucket).upload(join(work, produced), {
      destination: targetKey,
      contentType: 'application/pdf',
      resumable: false,
    });

    const [metadata] = await storage.bucket(bucket).file(targetKey).getMetadata();
    return { targetKey, sizeBytes: Number(metadata.size ?? 0) };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    return json(res, 200, { status: 'ok' });
  }

  if (req.method !== 'POST' || req.url !== '/convert') {
    return json(res, 404, { message: 'Not found' });
  }

  try {
    const body = await readBody(req);
    const { bucket, sourceKey, targetKey } = body;
    if (!bucket || !sourceKey || !targetKey) {
      return json(res, 400, {
        message: 'bucket, sourceKey and targetKey are all required',
      });
    }

    const started = Date.now();
    const result = await convert({ bucket, sourceKey, targetKey });
    console.log(
      JSON.stringify({
        message: 'converted',
        sourceKey,
        targetKey,
        ms: Date.now() - started,
      }),
    );
    return json(res, 200, result);
  } catch (error) {
    const status = error.status ?? 500;
    // The message goes back to the API, which shows it to the author, so it
    // says what happened rather than making them read a log they cannot see.
    const message =
      error.killed || error.signal === 'SIGTERM'
        ? 'The conversion took too long and was stopped'
        : (error.message ?? 'Conversion failed');

    console.error(JSON.stringify({ message: 'conversion failed', error: message }));
    return json(res, status, { message });
  }
});

// Cloud Run sends SIGTERM; finish what is in flight rather than being killed.
process.on('SIGTERM', () => server.close(() => process.exit(0)));

server.listen(PORT, () => console.log(`converter listening on ${PORT}`));
