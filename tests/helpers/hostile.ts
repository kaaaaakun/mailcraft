const C = (...n: number[]) => String.fromCharCode(...n);

/** Strings that break out of attributes / CSS / tags or smuggle script when mishandled. */
export const HOSTILE: string[] = [
  'left"><img src=x onerror=alert(1)>',
  "left' onmouseover='alert(1)",
  '"><script>alert(1)</script>',
  '</h1><script>alert(1)</script>',
  '1"><svg/onload=alert(1)>',
  '7',
  '1 ;} </style><script>alert(1)</script>',
  'red;background:url(javascript:alert(1))',
  'red" onclick="alert(1)',
  'url(javascript:alert(1))',
  'expression(alert(1))',
  "';alert(1);//",
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' ' + C(9) + 'javascript:alert(1)',
  'java' + C(9) + 'script:alert(1)',
  'java' + C(10) + 'script:alert(1)',
  C(1) + 'javascript:alert(1)',
  C(0x200b) + 'javascript:alert(1)',
  '&#106;avascript:alert(1)',
  '&#x6A;avascript&colon;alert(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
  'vbscript:msgbox(1)',
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<a href="javascript:alert(1)">x</a>',
  '<!-- <script>alert(1)</script> -->',
  '<![CDATA[<script>alert(1)</script>]]>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '{{x}}"><img src=x onerror=alert(1)>',
  'a'.repeat(5000),
  C(0, 1, 0x2028, 0x2029),
  '${alert(1)}',
  '#fff;position:fixed;top:0;left:0;width:100%;height:100%',
  'rgb(0,0,0);background:url(x)',
  'NaN',
  'Infinity',
  '-1e999',
  '1e999',
  '',
];

/** Non-string junk of every JSON type. */
export const JUNK: unknown[] = [null, true, false, 0, -1, 1e21, NaN, Infinity, [], [1, 2], {}, { a: 1 }, { toString: 'x' }, [[]]];

export const ALL_HOSTILE: unknown[] = [...HOSTILE, ...JUNK];
