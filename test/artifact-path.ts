import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getArtifactPath } from '../src/plugins/remote-cache/storage/index.js'

// Regression test for #800: artifact storage keys must use POSIX ('/')
// separators on every OS. They are object keys for remote stores (S3/GCS/Azure)
// and abstract-blob-store paths, not native filesystem paths, so a Windows '\'
// separator would produce keys that artifacts cached by Linux/macOS runners
// can never resolve (and vice versa).
test('getArtifactPath', async (t) => {
  await t.test('joins team and artifact id with a forward slash', () => {
    assert.equal(getArtifactPath('superteam', 'abc123'), 'superteam/abc123')
  })

  await t.test('uses POSIX separators regardless of host OS', () => {
    const key = getArtifactPath('team', 'hash')
    assert.ok(
      !key.includes('\\'),
      `artifact key must not contain a backslash, got "${key}"`,
    )
    assert.equal(key, 'team/hash')
  })

  await t.test('supports tag keys built on top of the artifact id', () => {
    assert.equal(getArtifactPath('team', 'hash.tag'), 'team/hash.tag')
  })
})
