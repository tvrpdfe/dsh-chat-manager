import fs from 'node:fs';

const css = fs.readFileSync('F:/workdir/dsh-chat-manager/.scratch/bundle-css.txt', 'utf8');
const chatCss = fs.readFileSync('F:/workdir/dsh-chat-manager/.scratch/bundle-chatcss.txt', 'utf8');

// Fixed variant: pane without overflow:hidden
const paneCssFixed = chatCss.replace(
  /\.qDHVXG_pane\{[^}]*\}/,
  '.qDHVXG_pane{min-height:0;display:flex;flex-direction:column}'
);

function rows(n, label) {
  let out = '';
  for (let i = 1; i <= n; i++) {
    out += `<div style="height:28px;flex:none;display:flex;align-items:center;padding:0 8px;border-bottom:1px solid #ececec;font:12px/1.4 system-ui;color:#444">${label} ${i}</div>`;
  }
  return out;
}

function page(paneCss) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0}
body{--dsh-sidebar-inline-padding:12px;--dsh-session-list-edge-inset:var(--dsh-sidebar-inline-padding);--dsh-session-list-scrollbar-width:8px;--dsh-session-list-scrollbar-offset:2px;--ds-ease-in-out:cubic-bezier(.4,0,.2,1)}
.shell{width:300px;height:700px;display:flex;flex-direction:column;background:#fff;border:1px solid #ddd}
${css}
${paneCss}
</style></head><body>
<div class="shell">
  <div class="qDHVXG_root">
    <div class="qDHVXG_sectionHeader" style="color:#999;font:12px system-ui">工作区 header</div>
    <div class="qDHVXG_split">
      <div class="qDHVXG_pane" style="flex-basis:50.00%">
        <div class="qDHVXG_listArea">
          <div class="qDHVXG_treeBody qDHVXG_wide">
            <div class="qDHVXG_list">${rows(40, '工作区')}</div>
          </div>
        </div>
      </div>
      <div class="qDHVXG_divider"></div>
      <div class="qDHVXG_pane" style="flex-basis:50.00%">
        <div class="qDHVXG_treeBody qDHVXG_wide qDHVXG_chatList">
          <div class="qDHVXG_list qDHVXG_flatList">${rows(40, '聊天')}</div>
        </div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

fs.writeFileSync('F:/workdir/dsh-chat-manager/.scratch/repro-current.html', page(chatCss));
fs.writeFileSync('F:/workdir/dsh-chat-manager/.scratch/repro-fixed.html', page(paneCssFixed));
console.log('repro html written');
