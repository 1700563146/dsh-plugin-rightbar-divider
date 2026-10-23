# dsh-plugin-rightbar-divider

[中文](README.zh.md) | English

DSH's right sidebar **already has** a drag handle. This plugin fixes the case where it stops working after whole-interface zoom: the handle is still rendered, but it is positioned with the visual viewport width instead of layout pixels, so at `zoom: 1.2` it sits ~320px inside the panel instead of on the divider.

The plugin:

- measures the panel's real left edge with `offsetLeft` (layout pixels, unaffected by `zoom` and slide transforms) and moves the host handle back onto it through a CSS variable;
- widens the hit area from 8px to 12px and draws a 2px hover/drag line;
- leaves width limits, persistence, and drag behavior to the host's `setRightbar`.

At 100% zoom it is effectively a wider hit area with a hover affordance.

## Install

From the DSH plugin market or npm:

```sh
dsh plugin --profile desktop add dsh-plugin-rightbar-divider
```

Then open **Plugins → Add plugin** and install `dsh-plugin-rightbar-divider`, or use the in-app plugin page. Open the right sidebar and hover the divider between chat and the sidebar: the cursor becomes `col-resize` and a thin line appears.

## Why it happens

`AppFrame` positions the two handles like this:

```js
{ side: 'sidebar',  left: cols.sidebar }
{ side: 'rightbar', left: viewport - normal.rightbar }
```

`viewport` is `frame.getBoundingClientRect().width` (visual pixels) while `left` is layout pixels. With `html { zoom }` the two diverge; the left handle uses layout pixels on both sides and stays aligned, the right one drifts by `viewport × (zoom − 1)`.

## Known limits

- Depends on private host attributes (`[data-side="rightbar"]`, `[data-rightbar-col]`, `[data-sidebar-right-open]`). If a future DSH renames them, the plugin quietly deactivates instead of breaking the layout.
- Under zoom, the host still changes width from visual pointer deltas, so dragging is slightly faster than the cursor (120% → 120px per 100px). The plugin does not take over pointer events.
- Fullscreen panels have no outer width handle by design; nothing is invented.

## Verify

```sh
node test.mjs
```

Covers layout-pixel math, re-measure on width change, deactivation when the handle disappears, the rect/zoom fallback, and cleanup on dispose.

## A proper upstream fix

In `AppFrame`, use `frame.offsetWidth` / `clientWidth` for `viewportWidth`, or derive the right handle's `left` from the panel's `offsetLeft`. That fixes every geometry that depends on `viewportWidth`, not just the handle.

## License

MIT
