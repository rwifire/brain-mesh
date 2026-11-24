import { describe, expect, it } from 'vitest';
import { conflictHunks, replaceBlock, stripLinksToConflicts, withEol } from '../../../src/generate/blocks.js';

const O = '<!-- brain-mesh:index -->';
const C = '<!-- /brain-mesh:index -->';

describe('conflictHunks', () => {
  it('finds a two-way hunk', () => {
    const text = 'a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b\nz\n';
    expect(conflictHunks(text)).toEqual([{ start: 1, end: 5, sides: [['x'], ['y']] }]);
    expect(conflictHunks(text.replace(/\n/g, '\r\n'))).toEqual([{ start: 1, end: 5, sides: [['x'], ['y']] }]);
  });

  it('finds a diff3 hunk', () =>
    expect(conflictHunks('<<<<<<< HEAD\nx\n||||||| base\nw\n=======\ny\n>>>>>>> b\n')[0]!.sides).toEqual([['x'], ['w'], ['y']]));

  it('unclosed is not a hunk', () => expect(conflictHunks('<<<<<<< HEAD\nx\n')).toEqual([]));
});

describe('replaceBlock', () => {
  it('replaces the block body', () =>
    expect(replaceBlock(`# T\n\n${O}\n- old\n${C}\ntail\n`, 'index', '- new\n', 'append')).toEqual({
      ok: true, text: `# T\n\n${O}\n- new\n${C}\ntail\n`,
    }));

  it('empty body', () => expect(replaceBlock(`${O}\n- old\n${C}\n`, 'index', '', 'append')).toEqual({ ok: true, text: `${O}\n${C}\n` }));

  it('append when no markers', () => {
    expect(replaceBlock('# T\n\ntext\n', 'index', '- a\n', 'append')).toEqual({ ok: true, text: `# T\n\ntext\n\n${O}\n- a\n${C}\n` });
    expect(replaceBlock('# T\n\ntext', 'index', '- a\n', 'append')).toEqual({ ok: true, text: `# T\n\ntext\n\n${O}\n- a\n${C}\n` });
  });

  it('append to an empty file', () => expect(replaceBlock('', 'index', '- a\n', 'append')).toEqual({ ok: true, text: `${O}\n- a\n${C}\n` }));

  it('prepend when no markers', () =>
    expect(replaceBlock('## Mine\n', 'agents', 'B\n', 'prepend')).toEqual({
      ok: true, text: '<!-- brain-mesh:agents -->\nB\n<!-- /brain-mesh:agents -->\n\n## Mine\n',
    }));

  it('prepend to an empty file', () =>
    expect(replaceBlock('', 'agents', 'B\n', 'prepend')).toEqual({ ok: true, text: '<!-- brain-mesh:agents -->\nB\n<!-- /brain-mesh:agents -->\n' }));

  it('heals a conflict inside the block', () => {
    const r = replaceBlock(`${O}\n- a\n<<<<<<< HEAD\n- b\n=======\n- c\n>>>>>>> x\n${C}\n`, 'index', '- a\n- b\n- c\n', 'append');
    expect(r).toEqual({ ok: true, text: `${O}\n- a\n- b\n- c\n${C}\n` });
  });

  it('heals duplicated markers from both sides', () => {
    const r = replaceBlock(`# T\n<<<<<<< HEAD\n${O}\n- a\n${C}\n=======\n${O}\n- b\n${C}\n>>>>>>> x\n`, 'index', '- a\n- b\n', 'append');
    expect(r).toEqual({ ok: true, text: `# T\n${O}\n- a\n- b\n${C}\n` });
  });

  it('refuses a straddling hunk', () =>
    expect(replaceBlock(`${O}\n- a\n<<<<<<< HEAD\n- b\n${C}\ncurated\n=======\n- c\n${C}\nother\n>>>>>>> x\n`, 'index', '', 'append').ok).toBe(false));

  it('refuses close before open', () => expect(replaceBlock(`${C}\n${O}\n`, 'index', '', 'append').ok).toBe(false));

  it('refuses an open without a close', () => expect(replaceBlock(`${O}\n- a\n`, 'index', '', 'append').ok).toBe(false));

  it('refuses a second block (it would swallow the text between)', () =>
    expect(replaceBlock(`${O}\n${C}\nx\n${O}\n${C}\n`, 'index', '', 'append').ok).toBe(false));

  it('refuses a conflict side that adds curated text next to a block', () =>
    expect(replaceBlock(`# T\n<<<<<<< HEAD\n${O}\n- a\n${C}\n=======\nnotes by hand\n>>>>>>> x\n`, 'index', '', 'append').ok).toBe(false));

  it('a conflict outside the block is kept', () => {
    const above = '<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> x\n';
    expect(replaceBlock(`${above}${O}\n- a\n${C}\n`, 'index', '- b\n', 'append')).toEqual({ ok: true, text: `${above}${O}\n- b\n${C}\n` });
  });

  it('works on CRLF input and returns LF', () =>
    expect(replaceBlock(`# T\r\n${O}\r\n- a\r\n${C}\r\n`, 'index', '- b\n', 'append')).toEqual({ ok: true, text: `# T\n${O}\n- b\n${C}\n` }));
});

describe('stripLinksToConflicts', () => {
  it('removes a links_to-only hunk', () =>
    expect(stripLinksToConflicts('id: x\n<<<<<<< HEAD\nlinks_to: [a]\n=======\nlinks_to: [b]\n>>>>>>> y\n')).toBe('id: x\n'));

  it('removes a hunk where one side is empty', () =>
    expect(stripLinksToConflicts('id: x\n<<<<<<< HEAD\nlinks_to: [a]\n=======\n>>>>>>> y\nname: n\n')).toBe('id: x\nname: n\n'));

  it('keeps other hunks', () => {
    const text = 'id: x\n<<<<<<< HEAD\nowner: "@a"\n=======\nowner: "@b"\n>>>>>>> y\n';
    expect(stripLinksToConflicts(text)).toBe(text);
  });
});

describe('withEol', () => {
  it('converts to CRLF when current uses it', () => expect(withEol('a\nb\n', 'x\r\n')).toBe('a\r\nb\r\n'));
  it('keeps LF otherwise', () => {
    expect(withEol('a\n', null)).toBe('a\n');
    expect(withEol('a\n', 'x\n')).toBe('a\n');
  });
});

describe('replaceBlock hash style', () => {
  it('appends hash markers', () =>
    expect(replaceBlock('a\n', 'managed', 'x\n', 'append', 'hash')).toEqual({
      ok: true,
      text: 'a\n\n# brain-mesh:managed\nx\n# /brain-mesh:managed\n',
    }));
  it('replaces an existing hash block', () =>
    expect(replaceBlock('a\n\n# brain-mesh:managed\nold\n# /brain-mesh:managed\nb\n', 'managed', 'new\n', 'append', 'hash')).toEqual({
      ok: true,
      text: 'a\n\n# brain-mesh:managed\nnew\n# /brain-mesh:managed\nb\n',
    }));
});
