/** Dynamic shop controls and panel backgrounds own their native pointer input. */
export function isUiElement(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(
    '[data-ui-interactive], button, input, select, textarea, [role="dialog"], .shop-panel, .settings-panel, .demo-console',
  );
}

export function uiHitAt(x: number, y: number): boolean { return isUiElement(document.elementFromPoint(x, y)); }
