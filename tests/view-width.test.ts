import assert from "node:assert/strict";
import test from "node:test";
import { needsWidthRefresh, observeRenderedWidth } from "../src/timeline/view-width";

test("refreshes only when a usable width differs from the rendered width", () => {
  assert.equal(needsWidthRefresh(390, 0, 280), false);
  assert.equal(needsWidthRefresh(390, 390, 280), false);
  assert.equal(needsWidthRefresh(390, 320, 280), true);
  assert.equal(needsWidthRefresh(280, 240, 280), false);
});

test("observes the actual timeline width and disconnects after cleanup", () => {
  const original = globalThis.ResizeObserver;
  let observer: FakeResizeObserver;
  class FakeResizeObserver {
    disconnected = false;
    constructor(private callback: ResizeObserverCallback) { observer = this; }
    observe(): void {}
    disconnect(): void { this.disconnected = true; }
    notify(): void { this.callback([], this as unknown as ResizeObserver); }
  }
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  try {
    const element = { clientWidth: 0 };
    let refreshes = 0;
    const stop = observeRenderedWidth(element as HTMLElement, 390, 280, () => { refreshes += 1; });
    observer!.notify();
    assert.equal(refreshes, 0);
    element.clientWidth = 340;
    observer!.notify();
    observer!.notify();
    assert.equal(refreshes, 1);
    stop();
    assert.equal(observer!.disconnected, true);
  } finally {
    globalThis.ResizeObserver = original;
  }
});
