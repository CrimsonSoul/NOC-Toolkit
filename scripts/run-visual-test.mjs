import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { setTimeout as delay } from 'timers/promises'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PREVIEW_PORT = 4173
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`
const SCREENSHOT_PATH = path.resolve(__dirname, '../visual-artifacts/app-preview.png')

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      }
    })
  })
}

async function waitForServer(url, attempts = 30, intervalMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'HEAD' })
      if (response.ok) return
    } catch (error) {
      // Ignore and retry until timeout
    }

    await delay(intervalMs)
  }

  throw new Error(`Preview server did not start at ${url}`)
}

async function captureScreenshot() {
  await fs.mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true })

  await runCommand('npx', ['playwright', 'install', 'chromium', '--with-deps'])

  await runCommand('npx', ['vite', 'build'])

  const preview = spawn('npx', ['vite', 'preview', '--host', '0.0.0.0', '--port', `${PREVIEW_PORT}`, '--strictPort'], {
    stdio: 'inherit',
  })

  try {
    await waitForServer(PREVIEW_URL)

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1365, height: 768 } })

    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true })

    await browser.close()
  } finally {
    preview.kill('SIGTERM')
  }
}

captureScreenshot().catch((error) => {
  console.error('Visual test failed:', error)
  process.exitCode = 1
})
