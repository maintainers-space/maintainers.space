import { describe, expect, it } from 'vitest'
import { readFileSync, realpathSync } from 'node:fs'
import { DFN_PATHS, TWEMOJI_PATH, TWEMOJI_VERSION } from './embed-assets'

describe('twemoji asset proxy', () => {
  it('pins the same asset version @twemoji/api itself defaults to', () => {
    // The embed generates codepoints with this twemoji build, so proxying a
    // different asset set would 404 exactly the emoji the two versions disagree
    // on. Read the installed package rather than trusting the constant.
    const client = realpathSync('node_modules/@colibri-social/client')
    const api = realpathSync(`${client}/../../@twemoji/api`)
    const base = readFileSync(`${api}/dist/twemoji.esm.js`, 'utf8').match(
      /base:"(https:\/\/[^"]+)"/
    )?.[1]
    expect(base).toBeTruthy()
    expect(base).toContain(`twemoji@${TWEMOJI_VERSION}/`)
  })

  it('accepts the codepoint filenames twemoji generates', () => {
    for (const p of [
      '72x72/1f600.png',
      '72x72/1f1e6-1f1e8.png',
      '72x72/1f469-200d-1f4bb.png',
      'svg/1f600.svg'
    ]) {
      expect(TWEMOJI_PATH.test(p), p).toBe(true)
    }
  })

  it('refuses anything that would make it an open proxy', () => {
    for (const p of [
      '../../../etc/passwd',
      '72x72/../../secret.png',
      '72x72/1f600.png/../..',
      'https://evil.example/x.png',
      '72x72/1f600.svg',
      '72x72/EVIL.png',
      '../package.json',
      '72x72/1f600.png?x=1'
    ]) {
      expect(TWEMOJI_PATH.test(p), p).toBe(false)
    }
  })
})

describe('DeepFilterNet asset proxy', () => {
  it('allowlists exactly the two paths the loader requests', () => {
    expect(DFN_PATHS).toEqual(['v3/pkg/df_bg.wasm', 'v3/models/DeepFilterNet3_onnx.tar.gz'])
  })

  it('refuses any other path', () => {
    for (const p of ['../../etc/passwd', 'v3/pkg/../../x', 'v3/pkg/df_bg.wasm/x', '']) {
      expect(DFN_PATHS.includes(p), p).toBe(false)
    }
  })
})
