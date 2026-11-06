export const THEMES = [
  { id: 'violet', name: '星夜紫', accent: '#8957ff', strong: '#692fe7', deep: '#35158e', rgb: '137, 87, 255' },
  { id: 'blue', name: '海湾蓝', accent: '#438dff', strong: '#2471e5', deep: '#173f98', rgb: '67, 141, 255' },
  { id: 'green', name: '森林绿', accent: '#20c59a', strong: '#0b9c77', deep: '#075c47', rgb: '32, 197, 154' },
  { id: 'orange', name: '日落橙', accent: '#ff914f', strong: '#e86b34', deep: '#8f391f', rgb: '255, 145, 79' },
  { id: 'pink', name: '樱花粉', accent: '#f267ad', strong: '#d73d87', deep: '#812550', rgb: '242, 103, 173' },
  { id: 'cyan', name: '极光青', accent: '#25bfd0', strong: '#078d9f', deep: '#075561', rgb: '37, 191, 208' },
];

export function normalizeTheme(id) {
  return THEMES.some(theme => theme.id === id) ? id : THEMES[0].id;
}

export function applyTheme(id, root = document.documentElement) {
  const theme = THEMES.find(item => item.id === normalizeTheme(id));
  root.dataset.theme = theme.id;
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-strong', theme.strong);
  root.style.setProperty('--accent-deep', theme.deep);
  root.style.setProperty('--accent-rgb', theme.rgb);
  root.style.setProperty('--purple', theme.accent);
  return theme.id;
}
