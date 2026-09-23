// Curated language -> color map for the repo OG image's language ring, in the
// spirit of GitHub's linguist palette (github/linguist's languages.yml) but
// scoped to the languages actually common across the repos people share —
// not the full ~500-entry list.
const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Vue: '#41b883',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Shell: '#89e051',
  Dockerfile: '#384d54',
  Dart: '#00B4AB',
  Elixir: '#6e4a7e',
  Erlang: '#B83998',
  Haskell: '#5e5086',
  Lua: '#000080',
  Nix: '#7e7eff',
  Zig: '#ec915c',
  Scala: '#c22d40',
  Clojure: '#db5855',
  Perl: '#0298c3',
  R: '#198CE7',
  Julia: '#a270ba',
  'Objective-C': '#438eff',
  MDX: '#fcb32c',
  Markdown: '#083fa1',
  Astro: '#ff5a03',
  Svelte: '#ff3e00',
  YAML: '#cb171e',
  JSON: '#292929',
  TeX: '#3D6117',
  Assembly: '#6E4C13',
  PowerShell: '#012456',
  Vim: '#199f4b',
  OCaml: '#3be133'
}

/** Deterministic fallback so an unmapped language still gets a stable, distinct color. */
function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 55%)`
}

export function languageColor(name: string): string {
  return LANGUAGE_COLORS[name] ?? hashColor(name)
}
