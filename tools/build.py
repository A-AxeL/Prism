#!/usr/bin/env python3
"""Same as tools/build.mjs, for machines with Python but no Node: python tools/build.py"""
import json, os, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(root, p), encoding='utf-8').read().replace('\r\n', '\n')
cfg = json.loads(rd('project.json'))
order = [l.strip() for l in rd('src/js/order.txt').split('\n') if l.strip() and not l.strip().startswith('#')]
js = ''.join(rd('src/js/' + f) for f in order)
js = re.sub(r"const VERSION='[^']*';", lambda m: "const VERSION='%s';" % cfg['version'], js, count=1)
page = rd('src/page.html').replace('\n/*@@CSS@@*/\n', rd('src/css/style.css'), 1).replace('\n/*@@JS@@*/\n', js, 1)
page = re.sub(r'<title>[^<]*</title>', lambda m: '<title>%s</title>' % cfg['title'], page, count=1)
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
open(os.path.join(root, 'dist/prism-artifact.html'), 'w', encoding='utf-8', newline='\n').write(page)
open(os.path.join(root, 'dist/prism.html'), 'w', encoding='utf-8', newline='\n').write(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + page + '</body></html>')
print('built %s %s: %d parts, %d KB' % (cfg['title'], cfg['version'], len(order), len(page) // 1024))
