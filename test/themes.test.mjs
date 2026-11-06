import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, applyTheme, normalizeTheme } from '../themes.js';

test('提供六套 id 唯一且强调色各不相同的主题', () => {
  assert.equal(THEMES.length, 6);
  assert.equal(new Set(THEMES.map(theme => theme.id)).size, 6);
  assert.equal(new Set(THEMES.map(theme => theme.accent)).size, 6);
  assert.ok(THEMES.every(theme => /^#[0-9a-f]{6}$/i.test(theme.accent)));
});

test('无效主题回退到星夜紫，且应用主题会写入完整配色变量', () => {
  assert.equal(normalizeTheme('not-a-theme'), 'violet');
  assert.equal(normalizeTheme('cyan'), 'cyan');
  const root = { dataset: {}, style: { values: {}, setProperty(key, value) { this.values[key] = value; } } };
  assert.equal(applyTheme('cyan', root), 'cyan');
  assert.equal(root.dataset.theme, 'cyan');
  assert.equal(root.style.values['--accent'], THEMES.find(theme => theme.id === 'cyan').accent);
  assert.equal(root.style.values['--accent-strong'], THEMES.find(theme => theme.id === 'cyan').strong);
});
