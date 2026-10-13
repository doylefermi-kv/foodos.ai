/**
 * Canonical / OG URLs under the GitHub Pages sub-path.
 *
 * Run with: node --test "website/src/lib/__tests__/*.test.ts"
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { absoluteUrl, pageUrl } from '../meta.ts'

test('the page URL is the origin plus the base the site was built with', () => {
  assert.equal(
    pageUrl('/foodos.ai/', 'https://doylefermi-kv.github.io'),
    'https://doylefermi-kv.github.io/foodos.ai/',
  )
  assert.equal(pageUrl('/', 'https://foodos.ai'), 'https://foodos.ai/')
  // Vite always sets BASE_URL, but an empty one must not produce "undefined".
  assert.equal(pageUrl('', 'https://foodos.ai'), 'https://foodos.ai/')
})

test('a sub-path URL resolves against the serving origin', () => {
  assert.equal(
    absoluteUrl('/foodos.ai/og-image.png', 'https://doylefermi-kv.github.io'),
    'https://doylefermi-kv.github.io/foodos.ai/og-image.png',
  )
  assert.equal(
    absoluteUrl('/foodos.ai/', 'https://doylefermi-kv.github.io'),
    'https://doylefermi-kv.github.io/foodos.ai/',
  )
})

test('the same markup works at the domain root', () => {
  assert.equal(absoluteUrl('/og-image.png', 'https://foodos.ai'), 'https://foodos.ai/og-image.png')
})

test('an already-absolute URL is left alone', () => {
  assert.equal(
    absoluteUrl('https://foodos.ai/og-image.png', 'https://doylefermi-kv.github.io'),
    'https://foodos.ai/og-image.png',
  )
})

test('a URL that cannot be resolved is returned unchanged', () => {
  assert.equal(absoluteUrl('/og-image.png', 'not-an-origin'), '/og-image.png')
})
