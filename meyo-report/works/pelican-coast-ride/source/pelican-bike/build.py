#!/usr/bin/env python3
"""把 three.min.js 与 game.js 内联进模板，产出单文件 dist/index.html"""
import pathlib
ROOT = pathlib.Path(__file__).parent
tpl = (ROOT / 'src/index.template.html').read_text(encoding='utf-8')
three = (ROOT.parent / 'vendor/three.min.js').read_text(encoding='utf-8')
game = (ROOT / 'src/game.js').read_text(encoding='utf-8')
three = three.replace('</script', '<\\/script')
game = game.replace('</script', '<\\/script')
html = tpl.replace('/*__THREE_INLINE__*/', three).replace('/*__GAME_INLINE__*/', game)
out = ROOT / 'dist/index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8')
print(f"built {out} ({len(html)/1024:.0f} KB)")
