// SPDX-License-Identifier: AGPL-3.0-or-later
//
// 🔴 THE `hidden` ATTRIBUTE HAS TO WIN OVER THE STYLESHEET, and this case exists because it did not.
//
// The browser's own `[hidden] { display: none }` is a low-specificity rule, so any author rule that sets
// `display` on the same element beats it. `.views { display: flex }` left the view switcher on screen while
// the JavaScript believed it had hidden it — no error, no warning, just a panel that would not go away.
//
// It was found by looking at the page, not by a test, which is why there is a test now. Every panel this app
// hides is a panel with an author `display` rule on it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import style from '../src/app/style.css?raw';

let sheet: HTMLStyleElement;

beforeEach(() => {
  sheet = document.createElement('style');
  sheet.textContent = style;
  document.head.append(sheet);
});

afterEach(() => sheet.remove());

describe('the stylesheet the app ships', () => {
  it('🔴 keeps `hidden` working on an element it also gives a display to', () => {
    const el = document.createElement('fieldset');
    el.className = 'views'; // the real class, which sets `display: flex`
    el.hidden = true;
    document.body.append(el);
    expect(getComputedStyle(el).display).toBe('none');
    el.remove();
  });

  it('leaves a visible element alone', () => {
    const el = document.createElement('fieldset');
    el.className = 'views';
    document.body.append(el);
    expect(getComputedStyle(el).display).toBe('flex');
    el.remove();
  });
});
