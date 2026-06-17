import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const BIN_DIR = join(ROOT_DIR, 'assets', 'bin');
const EDITOR_BIN = join(BIN_DIR, process.platform === 'win32' ? 'editor.exe' : 'editor');

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function run() {
  console.log(`[TEST] Verifying editor binary exists at ${EDITOR_BIN}...`);
  if (!(await fileExists(EDITOR_BIN))) {
    console.error(`[ERROR] Editor binary not found. Please run 'npm run build' first.`);
    process.exit(1);
  }

  const testVideo = join(__dirname, 'test_input.mp4');
  const outputVideo = join(__dirname, 'test_output.mp4');
  
  // Clean up old files
  if (await fileExists(testVideo)) await fs.unlink(testVideo);
  if (await fileExists(outputVideo)) await fs.unlink(outputVideo);

  console.log('[TEST] Generating test video (5s)...');
  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'testsrc=duration=5:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5',
      '-c:v', 'libx264', '-c:a', 'aac',
      testVideo
    ], { stdio: 'inherit' });
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
  });

  console.log(`[TEST] Running editor binary...`);
  
  await new Promise((resolve, reject) => {
    const editorArgs = [
      '--video-path', testVideo,
      '--output-path', outputVideo,
      '--start-ms', '1000',
      '--end-ms', '4000',
      '--crop-x', '320',
      '--crop-y', '0',
      '--crop-w', '405',
      '--crop-h', '720'
    ];
    console.log(`Args: ${editorArgs.join(' ')}`);

    const editorProcess = spawn(EDITOR_BIN, editorArgs);
    
    editorProcess.stdout.on('data', (data) => {
      console.log(`[EDITOR STDOUT] ${data.toString().trim()}`);
    });
    
    editorProcess.stderr.on('data', (data) => {
      console.error(`[EDITOR STDERR] ${data.toString().trim()}`);
    });
    
    editorProcess.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Editor exited with code ${code}`));
    });
  });

  console.log('[TEST] Checking output file...');
  if (!(await fileExists(outputVideo))) {
    throw new Error('Output video was not created!');
  }

  console.log('[TEST] Output video created successfully!');
  
  // Cleanup
  console.log('[TEST] Cleaning up test files...');
  await fs.unlink(testVideo);
  await fs.unlink(outputVideo);
  
  console.log('[TEST] E2E Editor Test PASSED!');
}

run().catch(err => {
  console.error('[TEST FAILED]', err);
  process.exit(1);
});
