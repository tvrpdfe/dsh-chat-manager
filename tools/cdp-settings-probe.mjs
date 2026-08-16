// Probe the live GUI: open the app, dump body text, navigate to the settings
// archived page and ASSERT the r8 time-label rendering (regression gate):
//   - every navigation click must find and press its target;
//   - the settings page must expose the 已归档会话 entry;
//   - the page text must not leak raw time.* keys;
//   - when the archived list has rows, at least one relative-time label
//     (刚刚 / N分钟 / N小时 / N天 / N个月 / N年) must be present.
// Any failed assertion throws and exits non-zero (no silent false-green).
// Usage: node cdp-settings-probe.mjs
import { launchChrome, connectPage, session, evaluate, sleep, runTool } from './cdp-lib.mjs';

const PORT = 9337;
const APP_URL = 'http://127.0.0.1:3080/';
const SETTINGS_LABEL = '设置';
const ARCHIVED_LABEL = '已归档会话';
const OPEN_SIDEBAR_LABEL = '打开侧边栏';
const TIME_KEY_LEAK = /time\.(days|minutes|hours|months|years|now|ago)/;
const RELATIVE_TIME = /(刚刚|\d+\s*分钟|\d+\s*小时|\d+\s*天|\d+\s*个月|\d+\s*年)/;
const BODY_HEAD_LEN = 800;
const LABEL_SLICE_LEN = 60;
const LABEL_CAP_BEFORE = 60;
const LABEL_CAP_AFTER = 80;
const ARCHIVED_CONTEXT = { before: 200, after: 1200 };
const SLEEP_PAGE_LOAD_MS = 8000;
const SLEEP_NAV_MS = 1500;
const SLEEP_PAGE_MS = 2000;

const browser = launchChrome({ port: PORT });

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

/** Click the first element matching selectors + matchExpr(x); throws when nothing matched. */
async function clickByLabel(cdp, selectors, matchExpr, label) {
  const clicked = await evaluate(cdp, `(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selectors.join(','))})].find((x) => ${matchExpr});
    if (b) b.click();
    return b !== undefined;
  })()`);
  assert(clicked === true, `点击失败：找不到「${label}」`);
}

async function main() {
  const ws = await connectPage(PORT);
  if (!ws) {
    throw new Error(browser.error ? `chrome failed to start: ${browser.error.message}` : 'no page target');
  }
  const cdp = session(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: APP_URL });
  await sleep(SLEEP_PAGE_LOAD_MS);

  const labelledElements = (cap) => `(() => {
    const out = [];
    document.querySelectorAll('button, [role="button"], [aria-label], [title]').forEach((b) => {
      const label = b.getAttribute('aria-label') || b.getAttribute('title') || b.innerText || "";
      if (label.trim()) out.push(label.trim().slice(0, ${LABEL_SLICE_LEN}));
    });
    return out.slice(0, ${cap});
  })()`;

  const bodyText = await evaluate(cdp, `document.body ? document.body.innerText.slice(0, ${BODY_HEAD_LEN}) : "NO BODY"`);
  console.log('--- body head ---');
  console.log(bodyText);
  console.log('--- labelled elements (before) ---');
  console.log(JSON.stringify(await evaluate(cdp, labelledElements(LABEL_CAP_BEFORE)), null, 0));

  // Open the sidebar, then re-enumerate.
  await clickByLabel(cdp, ['button'], `(x.getAttribute('aria-label') || "").includes(${JSON.stringify(OPEN_SIDEBAR_LABEL)})`, OPEN_SIDEBAR_LABEL);
  await sleep(SLEEP_NAV_MS);
  const labelledAfter = await evaluate(cdp, labelledElements(LABEL_CAP_AFTER));
  console.log('--- labelled elements (after open) ---');
  console.log(JSON.stringify(labelledAfter, null, 0));

  // Open settings, then the archived-sessions page.
  await clickByLabel(cdp, ['button', '[role="button"]'], `(x.getAttribute('aria-label') || x.innerText || "").trim() === ${JSON.stringify(SETTINGS_LABEL)}`, SETTINGS_LABEL);
  await sleep(SLEEP_PAGE_MS);
  const hasArchived = await evaluate(cdp, `document.body.innerText.includes(${JSON.stringify(ARCHIVED_LABEL)})`);
  console.log(`--- has ${ARCHIVED_LABEL} after settings click ---`, hasArchived);
  assert(hasArchived === true, `设置页未出现「${ARCHIVED_LABEL}」入口`);
  await clickByLabel(cdp, ['button', '[role="button"]', '[role="tab"]'], `(x.innerText || "").includes(${JSON.stringify(ARCHIVED_LABEL)})`, ARCHIVED_LABEL);
  await sleep(SLEEP_PAGE_MS);
  const archived = await evaluate(cdp, `(() => {
    const txt = document.body.innerText;
    const i = txt.indexOf(${JSON.stringify(ARCHIVED_LABEL)});
    const slice = txt.slice(Math.max(0, i - ${ARCHIVED_CONTEXT.before}), i + ${ARCHIVED_CONTEXT.after});
    return {
      slice,
      hasTimeKey: ${TIME_KEY_LEAK}.test(txt),
      rowCount: (slice.match(/恢复/g) || []).length,
      hasRelativeTime: ${RELATIVE_TIME}.test(slice),
    };
  })()`);
  console.log('--- archived page text ---');
  console.log(JSON.stringify(archived, null, 1));
  assert(archived.hasTimeKey === false, '页面文本泄漏原始 time.* 键名（r8 回归）');
  if (archived.rowCount === 0) {
    console.log('NOTE: 归档列表为空，跳过相对时间正向断言');
  } else {
    assert(archived.hasRelativeTime === true, `归档列表有 ${archived.rowCount} 行但未见相对时间文案（刚刚/N分钟/N天…，r8 回归）`);
  }
  console.log('PASS: 已归档会话页时间显示正常（无键名泄漏，相对时间渲染正确）');
  cdp.close();
}

runTool(browser, main);
