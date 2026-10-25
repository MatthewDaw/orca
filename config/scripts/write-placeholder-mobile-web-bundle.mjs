import { join, resolve } from 'node:path'
import {
  hashedAsset,
  readDesktopVersion,
  readProtocolWindow,
  writeMobileWebBundleTree
} from './mobile-web-bundle-manifest.mjs'

// Why: the packager requires a valid mobile web bundle, but the fork build ships without the mobile app.
const html =
  '<!doctype html><meta charset="utf-8"><title>Mobile web is not included in this build</title>\n'
const bytes = Buffer.from(html, 'utf8')
const { sha256, byteLength, contentType } = hashedAsset(bytes, 'html')

await writeMobileWebBundleTree({
  outDir: resolve(import.meta.dirname, '..', '..', 'out', 'mobile-web'),
  written: [{ path: 'index.html', bytes, sha256, byteLength, contentType }],
  desktopVersion: await readDesktopVersion(),
  protocolWindow: await readProtocolWindow()
})
console.log(`[mobile-web] wrote placeholder bundle to ${join('out', 'mobile-web')}`)
