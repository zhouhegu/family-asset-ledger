const THEME_KEY = 'family_asset_ledger_theme';
const THEME_MODES = ['system', 'light', 'dark'];
const systemAppearance = window.matchMedia?.('(prefers-color-scheme: dark)');

function readAppearance() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEME_MODES.includes(saved) ? saved : 'system';
  } catch { return 'system'; }
}

let appearance = readAppearance();

function resolveAppearance(mode, systemDark = Boolean(systemAppearance?.matches)) {
  return mode === 'light' || mode === 'dark' ? mode : systemDark ? 'dark' : 'light';
}

function applyAppearance() {
  document.documentElement.dataset.theme = resolveAppearance(appearance);
  const select = document.getElementById('appearanceSelect');
  if (select) select.value = appearance;
}

function repaintAppearance() {
  applyAppearance();
  // Canvas shares the CSS palette; leave open forms and ledger state untouched.
  if (typeof drawTrendChart === 'function') window.requestAnimationFrame(drawTrendChart);
}

function setAppearance(mode) {
  if (!THEME_MODES.includes(mode)) return;
  appearance = mode;
  repaintAppearance();
  let saved = true;
  try { localStorage.setItem(THEME_KEY, mode); } catch { saved = false; }
  feedback('preferences-feedback', saved ? '' : t('外观偏好无法保存，本次会话仍可使用所选外观。'));
}

// Resolve before styles load, including a saved manual override of the system theme.
applyAppearance();
systemAppearance?.addEventListener('change', () => {
  if (appearance === 'system') repaintAppearance();
});
