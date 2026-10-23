# 右栏分割线修复（`dsh-plugin-rightbar-divider`）

## 一句话

DSH 的右栏其实**本来就有**拖拽手柄；拖不动不是宿主没做，而是 `ui-zoom` 的整页 `zoom` 让手柄算错了位置。这个插件把宿主手柄搬回真正的分割线，并把命中区从 8px 加宽到 12px、悬停时画一条 2px 提示线。

## 为什么左边能拖、右边不能

宿主的两条分割线都在 `@deepseek-ai/dsh-client-ui-layout` 的 `AppFrame` 里，各是一个 8px 宽、`cursor: col-resize` 的透明 `div`：

```js
// 左侧
{ side: 'sidebar', left: cols.sidebar, ... }
// 右侧
{ side: 'rightbar', left: viewport - normal.rightbar, ... }
```

`viewport` 来自 `frame.getBoundingClientRect().width`，是**视觉像素**；而 `left` 写进样式时是**布局像素**。没有缩放时两者相等，两边都准。

`ui-zoom` 给 `<html>` 加上 `zoom: 1.2` 之后，视觉像素 = 布局像素 × 1.2。于是：

- 左栏：`left = cols.sidebar`，两边都是布局像素，**仍然对齐**；
- 右栏：`left = 视觉宽度 − 右栏宽度`，再被 zoom 乘一次，手柄整体向右偏 `视觉宽度 × (zoom − 1)`。
  在 120% 缩放、1600px 宽的窗口里，这个偏移约 **320px**：手柄跑进了面板内部，真正的分割线上自然既没有光标、也拖不动。

所以这不是「右栏不支持拖拽」，而是「手柄被画偏了」。把缩放点回 100%，分割线立刻就能拖 —— 这是最快的验证。另一个验证：在 120% 下沿着右栏左缘往右移约 300px，某处会突然出现左右箭头，那就是被画偏的手柄。

## 插件做了什么

`client.js` 里只做两件事，全部走 `ctx.effect`，卸载即还原：

1. **重算左缘**：从右栏面板 `[data-sidebar-right-open]` 沿 `offsetLeft` 链走到 frame。`offsetLeft` / `offsetWidth` 是布局像素，不受 `zoom` 和滑入动画的 `transform` 影响，所以算出来就是最终分割线的位置。再用一条 `!important` 的样式规则，通过 CSS 变量覆盖宿主手柄的 `left`。缩放变化时这个布局位置不变，不需要额外监听。
2. **加宽命中区 + 提示线**：12px（`margin-left: -6px`，仍以分割线为中心），`hover` / `[data-dragging]` 时叠一条 2px 的 `--dsw-alias-label-tertiary` 细线。

宽度本身还是宿主的 `setRightbar` 在管：上下限 300–70%、拖动结束后记住像素宽、关闭再开还在，插件一律不碰。

## 已知边界

- **依赖宿主的私有属性**：`[data-side="rightbar"]`、`[data-rightbar-col]`、`[data-sidebar-right-open]`。它们不是公开 API，DSH 升级后若改名，插件会「找不到手柄 → 自动让位」（不覆盖、不报错），但也就失效了，需要跟着改。
- **缩放下的拖动幅度**：宿主仍按鼠标的视觉位移改宽度。120% 时，拖动 100px 实际会改 120px，手柄会稍稍跑在光标前面；能用，但没有 100% 时那么跟手。这是宿主 drag 计算的另一处视觉/布局混用，插件不接管 pointer 事件，避免更脆。
- **全屏面板没有外侧手柄**：这是宿主的设计（全屏时面板盖住窗口，没有可调的外侧宽度），插件不会凭空造一个。
- **只在右栏普通展开态生效**：右栏关闭 / 全屏时手柄不存在，插件自动撤掉覆盖。

## 安装

**市场 / npm（推荐）**

1. **插件** → **添加插件**，填包名：

   ```
   dsh-plugin-rightbar-divider
   ```

   或者命令行：

   ```sh
   dsh plugin --profile desktop add dsh-plugin-rightbar-divider
   ```

2. 安装后点 **立即启用**，回到对话页（必要时刷新一次）。
3. 打开右侧栏，把鼠标放到聊天区和右栏之间的分割线上：应出现左右箭头，并有一条 2px 细线；按住拖动即可调宽。

**本地开发**

```powershell
cd D:\Code\rightbar-divider
# 在 插件 → 添加插件 里填这个绝对路径
```

## 验证 / 卸载

- 逻辑自检（不碰 profile、不开浏览器）：

  ```powershell
  cd D:\Code\rightbar-divider
  node test.mjs
  ```

  覆盖：布局像素换算、宽度变化后重算、手柄消失时撤掉覆盖、`offsetParent` 链断掉时按矩形 / zoom 兜底、卸载清理。

- 卸载：插件页停用或移除该行即可。停用后样式、CSS 变量、`html` 属性和监听器都会撤掉，右栏回到宿主原样。

## 更根治的两条路（不用插件）

- 把 `ui-zoom` 调到 100%，或只在需要看更多内容时临时缩放。
- 给宿主提一个修复：`AppFrame` 里把 `viewport` 改成布局像素（`frame.offsetWidth`/`clientWidth`），或把右侧手柄的 `left` 改成用面板的 `offsetLeft` 计算。这样所有依赖 `viewportWidth` 的几何（不只手柄）在缩放下都会一致。

## License

MIT
