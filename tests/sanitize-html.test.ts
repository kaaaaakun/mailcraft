import { describe, expect, it } from 'vitest';
import { createBlock, createDesign, createRow, createSampleDesign } from '../src/core/defaults';
import { renderBlockContent, renderHtml } from '../src/core/render';
import { sanitizeRichText } from '../src/core/sanitize';
import { sanitizeHtml } from '../src/core/sanitize-html';
import { HOSTILE } from './helpers/hostile';
import { assertSafe } from './helpers/assertSafe';

const C = (...n: number[]) => String.fromCharCode(...n);

/** Tricky payloads: mXSS, nested svg/math, comments, unclosed tags, entity-encoded schemes, data: URLs, obfuscation. */
export const CORPUS: string[] = [
  ...HOSTILE,
  '<p>ok</p><script>alert(1)</script>',
  '<SCRIPT SRC=//evil.example/x.js></SCRIPT>',
  '<ScRiPt>alert(1)</sCrIpT>',
  '<script/x>alert(1)</script>',
  '<img src=x onerror=alert(1)//',
  '<img src="x" onerror="alert(1)"',
  '<img/src=x/onerror=alert(1)>',
  '<img src=x onerror=alert(1)>',
  '<IMG SRC=javascript:alert(1)>',
  '<a href=" javascript:alert(1)">x</a>',
  '<a href="java&#9;script:alert(1)">x</a>',
  '<a href="java&#x0A;script:alert(1)">x</a>',
  '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>',
  '<a href="&#x6a;avascript&colon;alert(1)">x</a>',
  '<a href="jav&#x61;script:alert(1)">x</a>',
  '<a href="' + C(1) + 'javascript:alert(1)">x</a>',
  '<a href="' + C(0x200b) + 'javascript:alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<a href="DATA:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href=vbscript:msgbox(1)>x</a>',
  '<a href="javascript:alert(1)" href="https://ok.example">x</a>',
  '<a href=https://ok.example onclick=alert(1)>x</a>',
  '<a href="https://ok.example" target=_blank>x</a>',
  '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
  '<img src="data:image/png;base64,iVBORw0KGgo=">',
  '<img src="x" srcset="javascript:alert(1)">',
  '<svg><script>alert(1)</script></svg>',
  '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
  '<svg onload=alert(1)>',
  '<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>',
  '<svg><svg><script>alert(1)</script></svg></svg><b>after</b>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img src=1 onerror=alert(1)&gt;">',
  '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<style>@import "javascript:alert(1)";</style>',
  '<style><img src="</style><img src=x onerror=alert(1)>">',
  '<title><img src=x onerror=alert(1)></title>',
  '<textarea><img src=x onerror=alert(1)></textarea>',
  '<xmp><img src=x onerror=alert(1)></xmp>',
  '<plaintext><img src=x onerror=alert(1)>',
  '<template><img src=x onerror=alert(1)></template>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="javascript:alert(1)"></object>',
  '<embed src="javascript:alert(1)">',
  '<form action="javascript:alert(1)"><input type=submit formaction=javascript:alert(1)></form>',
  '<button formaction="javascript:alert(1)">x</button>',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<link rel=stylesheet href="javascript:alert(1)">',
  '<base href="javascript:alert(1)//">',
  '<video><source onerror=alert(1)></video>',
  '<details open ontoggle=alert(1)>',
  '<p style="background:url(javascript:alert(1))">x</p>',
  '<p style="background-image:url(https://evil.example/x)">x</p>',
  '<p style="width:expression(alert(1))">x</p>',
  '<p style="color:red;position:fixed;top:0;left:0;width:100%;height:100%">x</p>',
  '<p style="color:&#x72;ed;background:u&#x72;l(javascript:alert(1))">x</p>',
  '<p style="color:\\72 ed;background:\\75 rl(javascript:alert(1))">x</p>',
  '<p style="color:red/*;*/;background:url(x)">x</p>',
  '<p style="font-family:Arial;}</style><script>alert(1)</script>">x</p>',
  '<p style="behavior:url(x.htc);-moz-binding:url(x)">x</p>',
  '<div style="color:rgb(1,2,3);margin:0 auto;padding:10px 20px;text-align:center">ok</div>',
  '<p>unclosed <b>bold <i>italic',
  '<p>a</div></span></b>b',
  '<b><i>cross</b></i>',
  '<div><div><div><div>deep',
  '<p onclick',
  '<p title="unterminated',
  '<a href="https://ok.example"',
  '<',
  '<<script>script>alert(1)<</script>/script>',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '< script>alert(1)</ script>',
  '<p>1 < 2 > 0</p>',
  '<!-- unterminated <script>alert(1)</script>',
  '<!--><script>alert(1)</script>-->',
  '<!---><script>alert(1)</script>-->',
  '<!-- a --!><script>alert(1)</script>',
  '<!--[if IE]><script>alert(1)</script><![endif]-->',
  '<![CDATA[<script>alert(1)</script>]]>',
  '<?php echo 1; ?><b>x</b>',
  '<!DOCTYPE html><html><head><title>t</title><script>alert(1)</script></head><body onload=alert(1)><p>x</p></body></html>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '&#60;script&#62;alert(1)&#60;/script&#62;',
  '<p title="&quot; onmouseover=&quot;alert(1)">x</p>',
  "<p title='\" onmouseover=\"alert(1)'>x</p>",
  '<p title=x onmouseover=alert(1)>x</p>',
  '<p `title=x onmouseover=alert(1)>x</p>',
  '<p onmouseover=alert(1) title=x>x</p>',
  '<P ONMOUSEOVER=alert(1)>x</P>',
  '<p\tonmouseover=alert(1)>x</p>',
  '<p\nonmouseover=alert(1)>x</p>',
  '<p/onmouseover=alert(1)>x</p>',
  '<p ' + C(0x0b) + 'onmouseover=alert(1)>x</p>',
  '<a href="https://ok.example" style="color:red">ok</a><a href="javascript:alert(1)">bad</a>',
  '<table><tr><td onclick=alert(1) background="javascript:alert(1)">x</td></tr></table>',
  '<table><tr><td bgcolor="red;background:url(x)" width="100&quot; onclick=&quot;alert(1)">x</td></tr></table>',
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" valign="top" style="padding:10px">layout</td></tr></table>',
  '<font color="red" size="3" face="Arial">f</font>',
  '<font color="red;x" face="a;b">f</font>',
  '<ol start="3" type="a"><li>x</li></ol>',
  '<ol start="javascript:1"><li>x</li></ol>',
  '<p>' + 'a'.repeat(100000) + '</p>',
  '<div>'.repeat(500) + 'x',
  '<'.repeat(2000),
  '<a '.repeat(2000),
  '<p>' + '&'.repeat(1000) + '</p>',
];

describe('sanitizeHtml: allow-list behaviour', () => {
  it('keeps rich-text markup and filters styles / urls', () => {
    const out = sanitizeHtml('<p style="margin:0;color:#333;position:fixed">Hi <b>there</b> <a href="https://x.example" target="_blank">link</a><br><img src="https://x.example/a.png" alt="a" width="50"></p>');
    expect(out).toBe('<p style="margin:0;color:#333">Hi <b>there</b> <a href="https://x.example" target="_blank" rel="noopener noreferrer">link</a><br><img src="https://x.example/a.png" alt="a" width="50"></p>');
  });
  it('drops dangerous containers with their content and unwraps unknown tags', () => {
    expect(sanitizeHtml('a<script>alert(1)</script>b<svg><a>x</a></svg>c<marquee>d</marquee>')).toBe('abcd');
  });
  it('rich profile strips tables, html profile keeps them', () => {
    const t = '<table role="presentation" width="100%"><tr><td align="center" bgcolor="#fff" style="padding:8px">x</td></tr></table>';
    expect(sanitizeHtml(t, 'rich')).not.toContain('<table');
    expect(sanitizeHtml(t, 'html')).toBe('<table role="presentation" width="100%"><tr><td align="center" bgcolor="#fff" style="padding:8px">x</td></tr></table>');
  });
  it('closes unclosed tags and drops stray end tags', () => {
    expect(sanitizeHtml('<p>a <b>b</i></p>c</div>')).toBe('<p>a <b>b</b></p>c');
    expect(sanitizeHtml('<div><p>open')).toBe('<div><p>open</p></div>');
  });
  it('is idempotent', () => {
    for (const p of CORPUS) {
      const once = sanitizeHtml(p, 'html');
      expect(sanitizeHtml(once, 'html'), p.slice(0, 80)).toBe(once);
      const r = sanitizeHtml(p, 'rich');
      expect(sanitizeHtml(r, 'rich'), p.slice(0, 80)).toBe(r);
    }
  });
  it('never throws on non-strings', () => {
    for (const v of [undefined, null, 1, {}, []]) expect(sanitizeHtml(v as any)).toBe('');
  });
  it('sanitizeRichText (editor canvas) is the same implementation', () => {
    for (const p of CORPUS.slice(0, 60)) expect(sanitizeRichText(p)).toBe(sanitizeHtml(p, 'rich'));
  });
});

describe('sanitizeHtml: tricky payload corpus', () => {
  for (const profile of ['rich', 'html'] as const) {
    it(`${profile}: output is safe and balanced for all ${CORPUS.length} payloads`, () => {
      for (const p of CORPUS) {
        const out = sanitizeHtml(p, profile);
        assertSafe(`<table><tr><td>${out}</td></tr></table>`, `${profile}: ${p.slice(0, 120)}`);
      }
    });
  }
});

describe('canvas / export parity', () => {
  it('renderBlockContent (canvas) and renderHtml (export) emit identical block markup for every payload', () => {
    for (const p of CORPUS.slice(0, 90)) {
      for (const type of ['text', 'html'] as const) {
        const b: any = createBlock(type);
        b.html = p;
        const canvas = renderBlockContent(b);
        const d = createDesign();
        const r = createRow([1]);
        r.columns[0].blocks.push(b);
        d.rows.push(r);
        expect(renderHtml(d), `${type}: ${p.slice(0, 80)}`).toContain(canvas);
        // what the browser makes of the canvas markup is itself stable under another sanitize pass
        const el = document.createElement('div');
        el.innerHTML = canvas;
        expect(el.querySelector('script,iframe,object,embed,style,svg,math,form,input'), p.slice(0, 80)).toBeNull();
        for (const e of Array.from(el.querySelectorAll('*'))) for (const a of Array.from(e.attributes)) expect(a.name.startsWith('on')).toBe(false);
      }
    }
  });

  it('text blocks never keep tables; html blocks keep tables', () => {
    const t = '<table><tr><td style="padding:4px">x</td></tr></table>';
    const tb: any = createBlock('text'); tb.html = t;
    const hb: any = createBlock('html'); hb.html = t;
    expect(renderBlockContent(tb)).not.toContain('<table');
    expect(renderBlockContent(hb)).toContain('<table');
  });
});

describe('trustedHtml option', () => {
  const mk = (type: 'text' | 'html') => {
    const b: any = createBlock(type);
    b.html = '<p onclick="x()">hi</p><script>1</script>';
    const d = createDesign();
    const r = createRow([1]);
    r.columns[0].blocks.push(b);
    d.rows.push(r);
    return d;
  };
  it('default sanitizes the html block', () => {
    expect(renderHtml(mk('html'))).not.toContain('<script');
    expect(renderHtml(mk('html'))).not.toContain('onclick');
  });
  it('trustedHtml: true emits the html block verbatim', () => {
    expect(renderHtml(mk('html'), { trustedHtml: true })).toContain('<script>1</script>');
  });
  it('trustedHtml never affects text blocks', () => {
    const out = renderHtml(mk('text'), { trustedHtml: true });
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onclick');
  });
  it('sample design exports contain no sanitizer losses', () => {
    const html = renderHtml(createSampleDesign());
    expect(html).toContain('<b>AUTUMN20</b>');
    expect(html).toContain('<a href="#" style="color:#6b7280">');
  });
});
