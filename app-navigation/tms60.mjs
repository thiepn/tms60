import { mountAppSwitcher } from './switcher.mjs';
const header = document.querySelector('.topbar-inner');
if (header && !header.querySelector('[data-app-switcher]')) {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./switcher.css', import.meta.url).href;
  document.head.append(style);
  const button = document.createElement('button');
  button.className = 'btn';
  button.type = 'button';
  button.dataset.appSwitcher = '';
  button.textContent = 'Apps';
  button.setAttribute('aria-label', 'Switch THIEPN app');
  header.append(button);
  mountAppSwitcher(button, 'tms60');
}
