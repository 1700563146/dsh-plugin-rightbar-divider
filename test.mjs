/**
 * 逻辑自检（没有浏览器）：用桩 DOM 跑 client.js 的几何计算与清理。
 * 用法：node test.mjs
 *
 * 它验证：布局像素换算、面板切换时重新观测、手柄消失时撤掉覆盖、
 * 卸载时把属性/变量/样式全部还原。它不验证真页面上的长相。
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const attrs = new Set();
const vars = new Map();
let styleRemoved = false;
let handlePresent = true;
let panelWidth = 350;
let zoom = '1';
let useOffsetChain = true;

const handle = { parentElement: null, offsetLeft: 0, offsetParent: null, offsetWidth: 12, getClientRects: () => [{}] };
const column = { offsetLeft: 1000, offsetWidth: 0, offsetParent: null };
const panel = {
  offsetWidth: panelWidth,
  offsetLeft: -panelWidth,
  offsetParent: null,
  getClientRects: () => (panelWidth > 0 ? [{}] : []),
  getBoundingClientRect: () => ({ left: 300, top: 0, width: panelWidth, height: 800 }),
};
const frame = {
  offsetLeft: 0,
  offsetWidth: 1000,
  offsetParent: null,
  parentElement: null,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
  querySelectorAll: () => (handlePresent ? [panel] : []),
};
handle.parentElement = frame;

if (useOffsetChain) {
  panel.offsetParent = column;
  column.offsetParent = frame;
} else {
  panel.offsetParent = null;
}

const root = {
  style: {
    setProperty(name, value) { vars.set(name, value); },
    removeProperty(name) { vars.delete(name); },
  },
  setAttribute(name) { attrs.add(name); },
  removeAttribute(name) { attrs.delete(name); },
};

globalThis.document = {
  documentElement: root,
  body: frame,
  querySelector: () => (handlePresent ? handle : null),
  getElementById: () => frame,
  createElement: () => ({
    dataset: {},
    textContent: '',
    remove() { styleRemoved = true; },
  }),
  head: { appendChild() {} },
};
globalThis.getComputedStyle = () => ({ zoom });
let captured = null;
let rafQueue = [];
function flushRaf() {
  const queue = rafQueue;
  rafQueue = [];
  for (const fn of queue) fn();
}

globalThis.requestAnimationFrame = (fn) => {
  rafQueue.push(fn);
  return rafQueue.length;
};
globalThis.cancelAnimationFrame = () => {};
const observers = [];
globalThis.MutationObserver = class {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe() {}
  disconnect() { this.disconnected = true; }
};
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); this.disconnected = true; }
};
globalThis.window = {
  innerWidth: 1200,
  addEventListener() {},
  removeEventListener() {},
  __ModuleLoader__: {
    load({ id, factory }) {
      captured = { id, plugin: factory(() => { throw new Error('client.js 不应 import 任何模块'); }) };
    },
  },
};

const here = dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(join(here, 'client.js')).href);

assert.equal(captured.id, 'dsh-plugin-rightbar-divider', '模块 id 必须等于包名');

let dispose = null;
captured.plugin.apply({
  effect(fn) {
    dispose = fn();
    return dispose;
  },
});

assert.ok(attrs.has('data-dsh-rightbar-divider'), '找到面板后应激活覆盖');
assert.equal(vars.get('--dsh-rightbar-divider-left'), '650px', '1000 - 350 = 650');

// 拖动时宽度变化：面板左缘跟着走。
panelWidth = 400;
panel.offsetWidth = panelWidth;
panel.offsetLeft = -panelWidth;
const resize = observers.find((o) => o instanceof globalThis.ResizeObserver);
assert.ok(resize, '应创建 ResizeObserver');
resize.callback();
flushRaf();
assert.equal(vars.get('--dsh-rightbar-divider-left'), '600px', '宽度变化后应重算');

// 面板隐藏（后台会话 / 关栏）：撤掉覆盖，交还宿主。
handlePresent = false;
resize.callback();
flushRaf();
assert.equal(attrs.size, 0, '手柄消失时应撤掉属性');
assert.equal(vars.size, 0, '手柄消失时应撤掉变量');

// 回来再测一次兜底路径：offsetParent 链断开时按 rect / zoom 换算。
handlePresent = true;
panelWidth = 360;
panel.offsetWidth = panelWidth;
panel.offsetLeft = 0;
panel.offsetParent = null;
zoom = '1.2';
useOffsetChain = false;
resize.callback();
flushRaf();
assert.equal(vars.get('--dsh-rightbar-divider-left'), '250px', '300 / 1.2 = 250');

// 卸载：样式、属性、变量都要收干净。
dispose();
assert.equal(attrs.size, 0, '卸载后不应留下属性');
assert.equal(vars.size, 0, '卸载后不应留下变量');
assert.ok(styleRemoved, '卸载后应移除注入的 <style>');

console.log('ok  右栏手柄几何与清理逻辑通过');
