import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const bundle = path.resolve('com.willvoorhees.openkneeboard-configurator.sdPlugin');
const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));

function imagePath(reference: string, suffix = ''): string {
  const svg = path.join(bundle, `${reference}${suffix}.svg`);
  const png = path.join(bundle, `${reference}${suffix}.png`);
  if (fs.existsSync(svg)) return svg;
  if (fs.existsSync(png)) return png;
  throw new Error(`Missing image ${reference}${suffix}`);
}

test('manifest artwork is complete, local, and has high-resolution variants', () => {
  const references = [manifest.CategoryIcon, manifest.Icon, ...manifest.Actions.flatMap(
    (action: { Icon: string; States: { Image: string }[] }) =>
      [action.Icon, ...action.States.map((state) => state.Image)],
  )];
  for (const reference of references) {
    assert.match(reference, /^imgs\//);
    for (const suffix of ['', '@2x']) {
      const file = imagePath(reference, suffix);
      const contents = fs.readFileSync(file);
      if (file.endsWith('.svg')) assert.match(contents.toString('utf8'), /^<svg[^>]+viewBox=/);
      else assert.equal(contents.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    }
  }
});

test('plugin and action IDs use the configurator namespace', () => {
  assert.equal(manifest.Name, 'OpenKneeboard Configurator');
  assert.equal(manifest.Category, manifest.Name);
  assert.equal(manifest.UUID, 'com.willvoorhees.openkneeboard-configurator');
  assert.equal(new Set(manifest.Actions.map((action: { UUID: string }) => action.UUID)).size, manifest.Actions.length);
  for (const action of manifest.Actions) assert.ok(action.UUID.startsWith(`${manifest.UUID}.`));
});

test('every action has the bundled offline settings UI', () => {
  const file = path.join(bundle, manifest.PropertyInspectorPath);
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /connectElgatoStreamDeckSocket/);
  assert.match(html, /setSettings/);
  assert.doesNotMatch(html, /https?:\/\//);
});
