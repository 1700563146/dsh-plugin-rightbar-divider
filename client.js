/**
 * 右栏分割线修复（Client 半区）。
 *
 * 宿主的右栏本来就有自己的拖拽手柄：
 *   AppFrame 里 <div class="...handle" data-side="rightbar"
 *                      style="left: viewportWidth - rightbarWidth">，
 *   cursor: col-resize，宽 8px。
 *
 * 问题出在 `viewportWidth`：它是 frame.getBoundingClientRect().width，也就是**视觉像素**，
 * 但 left 是**布局像素**。ui-zoom 给 <html> 加 zoom 之后两者不再相等，右栏越靠右差得越多
 * （左栏手柄两边都是布局像素，所以看不出问题）。结果是手柄被画到了面板内部，而真正的
 * 分割线上没有任何可拖区域。
 *
 * 这个插件不碰宿主状态，只做两件事：
 *   1. 用 offsetLeft 链（布局像素，不受 zoom / transform 影响）算出面板左缘的真实位置，
 *      通过 CSS 变量把宿主手柄的 left 覆盖到那里；
 *   2. 把命中区从 8px 加宽到 12px，悬停 / 拖动时画一条 2px 的提示线。
 *
 * 拖动本身仍然走宿主逻辑（pointer capture + setRightbar），所以宽度偏好、上下限、
 * 关闭后的记忆都还是宿主那套。卸载时样式、变量、属性一并撤掉。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-rightbar-divider',
  factory() {
    const ACTIVE_ATTR = 'data-dsh-rightbar-divider';
    const LEFT_VAR = '--dsh-rightbar-divider-left';
    const STYLE_TAG = 'dsh-plugin-rightbar-divider/divider.css';

    const CSS = `
      html[${ACTIVE_ATTR}] [data-side="rightbar"] {
        left: var(${LEFT_VAR}) !important;
        width: 12px !important;
        margin-left: -6px !important;
      }
      html[${ACTIVE_ATTR}] [data-side="rightbar"]::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 50%;
        width: 2px;
        margin-left: -1px;
        border-radius: 1px;
        background: transparent;
        pointer-events: none;
        transition: background-color 120ms ease, opacity 120ms ease;
      }
      html[${ACTIVE_ATTR}] [data-side="rightbar"]:hover::after,
      html[${ACTIVE_ATTR}] [data-side="rightbar"][data-dragging]::after {
        background: var(--dsw-alias-label-tertiary, rgba(127, 127, 127, 0.55));
        opacity: 0.55;
      }
    `;

    /**
     * 元素左缘相对 frame 的布局像素。offsetLeft 不受 zoom 和 transform 影响，
     * 所以界面缩放后、面板滑入动画中算出来都是最终位置。
     * @returns {number | null} 不在 frame 内时返回 null。
     */
    function chainLeft(element, frame) {
      let x = 0;
      let node = element;
      while (node !== null && node !== frame) {
        x += node.offsetLeft;
        node = node.offsetParent;
      }
      return node === frame ? x : null;
    }

    /** offsetParent 链断掉时的兜底：用视觉矩形除以 zoom 换算回布局像素。 */
    function visualLeft(element, frame) {
      const target = element.getBoundingClientRect();
      const host = frame.getBoundingClientRect();
      const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      return (target.left - host.left) / zoom;
    }

    return {
      apply(ctx) {
        ctx.effect(() => {
          const root = document.documentElement;
          const app = document.getElementById('root') ?? document.body;
          const style = document.createElement('style');
          style.dataset.plugin = 'dsh-plugin-rightbar-divider';
          style.dataset.pluginCss = STYLE_TAG;
          style.textContent = CSS;
          document.head.appendChild(style);

          let panel = null;
          let lastLeft = null;
          let pending = 0;
          let disposed = false;

          const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;

          const deactivate = () => {
            root.removeAttribute(ACTIVE_ATTR);
            root.style.removeProperty(LEFT_VAR);
            lastLeft = null;
            if (panel !== null && resize !== null) {
              resize.unobserve(panel);
              panel = null;
            }
          };

          const sync = () => {
            if (disposed) return;
            const handle = document.querySelector('[data-side="rightbar"]');
            if (handle === null) {
              deactivate();
              return;
            }
            const frame = handle.parentElement;
            if (frame === null) {
              deactivate();
              return;
            }
            let next = null;
            for (const candidate of frame.querySelectorAll('[data-rightbar-col] [data-sidebar-right-open]')) {
              // 后台会话的面板也在 DOM 里，但被 [hidden] 收起；只认真正画出来的那个。
              if (candidate.offsetWidth > 0 && candidate.getClientRects().length > 0) {
                next = candidate;
                break;
              }
            }
            if (next === null) {
              deactivate();
              return;
            }
            const left = chainLeft(next, frame) ?? visualLeft(next, frame);
            if (left === null || !Number.isFinite(left)) {
              deactivate();
              return;
            }
            if (next !== panel) {
              if (panel !== null && resize !== null) resize.unobserve(panel);
              panel = next;
              if (resize !== null) resize.observe(panel);
            }
            // 半像素足够，避免拖动时每一帧都写一次样式。
            const rounded = Math.round(left * 2) / 2;
            if (rounded !== lastLeft) {
              root.style.setProperty(LEFT_VAR, `${rounded}px`);
              root.setAttribute(ACTIVE_ATTR, '');
              lastLeft = rounded;
            }
          };

          function schedule() {
            if (disposed || pending !== 0) return;
            pending = requestAnimationFrame(() => {
              pending = 0;
              sync();
            });
          }

          // 手柄、面板都是 React 后来挂上来的：监听 #root 的子树变化。
          const mutations = new MutationObserver(schedule);
          mutations.observe(app, { childList: true, subtree: true });
          // 窗口尺寸变化时 frame 不一定变宽高（右栏可能保持像素宽度），两条都听。
          if (resize !== null) resize.observe(app);
          window.addEventListener('resize', schedule);

          sync();

          return () => {
            disposed = true;
            if (pending !== 0) {
              cancelAnimationFrame(pending);
              pending = 0;
            }
            mutations.disconnect();
            if (resize !== null) resize.disconnect();
            window.removeEventListener('resize', schedule);
            deactivate();
            style.remove();
          };
        }, 'rightbar-divider: patch');
      },
    };
  },
});
