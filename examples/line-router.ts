#!/usr/bin/env bun
/**
 * LINE webhook router for multi-session setups.
 *
 * When running multiple Claude Code sessions (each with its own LINE_STATE_DIR
 * and LINE_WEBHOOK_PORT), a single LINE channel can only point to one webhook URL.
 * This router sits at port 3456, verifies the HMAC signature once, and fans the
 * request out to each session's local port.
 *
 * Usage:
 *   LINE_CHANNEL_SECRET=<secret> bun examples/line-router.ts
 *
 * Or set LINE_CHANNEL_SECRET in one of the state .env files and let the router
 * find it automatically (see ENV_PATHS below).
 *
 * Configure your LINE channel webhook to point at:
 *   https://your-server/webhook  (routed to port 3456)
 *
 * Session ports (edit PORTS to match your LINE_WEBHOOK_PORT values):
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { readFileSync } from 'fs'

// ---- Configuration ---------------------------------------------------------

/** Ports of the individual session servers. Must match their LINE_WEBHOOK_PORT. */
const PORTS = [3461, 3462, 3463, 3464]

/** Port this router listens on (expose this to the internet via nginx/caddy). */
const LISTEN_PORT = 3456

/** .env files to search for LINE_CHANNEL_SECRET if not set in environment. */
const ENV_PATHS = [
  `${process.env.HOME}/.claude/channels/line/.env`,
]

// ---- Load secret -----------------------------------------------------------

let SECRET = process.env.LINE_CHANNEL_SECRET
if (!SECRET) {
  for (const p of ENV_PATHS) {
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^LINE_CHANNEL_SECRET=(.*)$/)
        if (m) { SECRET = m[1].trim(); break }
      }
      if (SECRET) break
    } catch {}
  }
}

if (!SECRET) {
  process.stderr.write(
    'line-router: LINE_CHANNEL_SECRET not found\n' +
    '  set it in the environment or in one of:\n' +
    ENV_PATHS.map(p => '    ' + p).join('\n') + '\n',
  )
  process.exit(1)
}

// ---- Signature verification (constant-time) --------------------------------

function verifySignature(body: string, signature: string): boolean {
  const expected = createHmac('sha256', SECRET!).update(body).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ---- Router ----------------------------------------------------------------

Bun.serve({
  port: LISTEN_PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (req.method !== 'POST' || url.pathname !== '/webhook') {
      return new Response('Not Found', { status: 404 })
    }

    const body = await req.text()
    const sig  = req.headers.get('x-line-signature') ?? ''

    if (!verifySignature(body, sig)) {
      process.stderr.write('line-router: invalid signature\n')
      return new Response('Unauthorized', { status: 401 })
    }

    // Fan out to all session ports concurrently (errors are logged but not fatal)
    await Promise.all(PORTS.map(port =>
      fetch('http://localhost:' + port + '/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-line-signature': sig },
        body,
      }).catch((e: unknown) =>
        process.stderr.write('line-router: port ' + port + ' error: ' + e + '\n'),
      ),
    ))

    return new Response('OK', { status: 200 })
  },
})

process.stderr.write('line-router: listening on port ' + LISTEN_PORT + '\n')
