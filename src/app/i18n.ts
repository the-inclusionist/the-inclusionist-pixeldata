// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Three languages are a FLOOR, not a goal (pillar 3 of ADR-0010): pt-BR, English and Spanish. Every string
// is born translatable here rather than being retrofitted, because a string hard-coded in a template is
// invisible until somebody switches language and finds a hole.
//
// ⚠️ This tool is not a game, and the boundary decided on 2026-08-24 still applies: the FRAME lives in the
// key and content crosses through a parameter. A region called "pele" is CONTENT — the vocabulary a person
// invents for their own artwork — so it is never translated. Only the interface around it is.

export const LANGUAGES = ['pt-BR', 'en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

type Dictionary = Readonly<Record<string, string>>;

const PT_BR: Dictionary = {
  'app.title': 'pixeldata — anotação semântica',
  'app.tagline': 'Importa pixel art e escreve o que cada píxel SIGNIFICA, para a cor poder mudar sem a forma mudar.',
  'zone.accessibility': 'Acessibilidade',
  'zone.work': 'Espaço de trabalho',
  'zone.explanation': 'Explicação',
  'lang.label': 'Idioma',
  'import.label': 'Abrir pixel art',
  'import.hint': 'Escolha um ou mais ficheiros PNG. Nada é enviado para lado nenhum: a leitura acontece neste aparelho.',
  'import.folder': 'Abrir uma pasta',
  'import.capped': 'A pasta tem mais ficheiros do que o limite; foram lidos os primeiros',
  'import.none': 'Nenhum PNG nessa pasta.',
  'panel.art': 'A imagem, a 4×',
  'panel.colors': 'As cores, e o que cada uma significa',
  'panel.samePalette': 'Outras imagens com a mesma paleta',
  'panel.sameDrawing': 'O mesmo desenho, com paletas diferentes',
  'state.empty': 'Nenhuma imagem aberta ainda.',
  'state.notBuilt': 'Só o leitor de PNG existe até agora. Abrir um ficheiro mostra o que ele encontrou lá dentro; os quatro painéis ainda não estão ligados.',
  'read.size': 'Dimensões',
  'read.colorType': 'Tipo de cor PNG',
  'read.colors': 'Cores únicas',
  'read.partialAlpha': 'Píxeis com alfa parcial',
  'read.colorChunks': 'Blocos de gestão de cor',
  'read.none': 'nenhum',
  'read.failed': 'Não foi possível ler este ficheiro:',
  'colour.nothing': 'nada (transparente)',
  'region.nothing': '— nada —',
  'row.region': 'Região',
  'row.level': 'Nível',
  'sheet.label': 'Folha',
  'region.add': 'Nova região',
  'region.addLabel': 'Nome da região a acrescentar',
  'explain.colours': 'cores',
  'explain.sheets': 'folhas no conjunto',
  'explain.isolated': 'isolada',
  'explain.refused': 'ficheiros recusados',
  'state.notWired': 'Os quatro painéis estão ligados.',
  'view.legend': 'O que o painel mostra',
  'view.original': 'Original',
  'view.recomposed': 'Recomposto',
  'view.difference': 'Diferença',
  'save.title': 'Gravar o conjunto',
  'save.name': 'Nome do conjunto',
  'save.author': 'Autor',
  'save.url': 'URL de origem',
  'save.licence': 'Licença',
  'save.door': 'Porta',
  'save.action': 'Gravar os dois ficheiros',
  'save.done': 'Gravado:',
  'save.cancelled': 'Gravação cancelada.',
  'save.blocked': 'A anotação ainda não fecha, por isso nada foi gravado:',
  'harvest.done': 'Paleta colhida:',
  'harvest.partial': 'Paleta colhida em parte, degraus por preencher:',
};

const EN: Dictionary = {
  'app.title': 'pixeldata — semantic annotation',
  'app.tagline': 'Imports pixel art and writes down what each pixel MEANS, so colour can change without the shape changing.',
  'zone.accessibility': 'Accessibility',
  'zone.work': 'Workspace',
  'zone.explanation': 'Explanation',
  'lang.label': 'Language',
  'import.label': 'Open pixel art',
  'import.hint': 'Choose one or more PNG files. Nothing is uploaded anywhere: the reading happens on this device.',
  'import.folder': 'Open a folder',
  'import.capped': 'The folder holds more files than the limit; these are the first',
  'import.none': 'No PNG in that folder.',
  'panel.art': 'The image, at 4×',
  'panel.colors': 'The colours, and what each one means',
  'panel.samePalette': 'Other images sharing this palette',
  'panel.sameDrawing': 'The same drawing, with different palettes',
  'state.empty': 'No image open yet.',
  'state.notBuilt': 'Only the PNG reader exists so far. Opening a file shows what it found inside; the four panels are not wired up yet.',
  'read.size': 'Dimensions',
  'read.colorType': 'PNG colour type',
  'read.colors': 'Unique colours',
  'read.partialAlpha': 'Pixels with partial alpha',
  'read.colorChunks': 'Colour-management chunks',
  'read.none': 'none',
  'read.failed': 'This file could not be read:',
  'colour.nothing': 'nothing (transparent)',
  'region.nothing': '— nothing —',
  'row.region': 'Region',
  'row.level': 'Level',
  'sheet.label': 'Sheet',
  'region.add': 'New region',
  'region.addLabel': 'Name of the region to add',
  'explain.colours': 'colours',
  'explain.sheets': 'sheets in the set',
  'explain.isolated': 'isolated',
  'explain.refused': 'files refused',
  'state.notWired': 'All four panels are wired.',
  'view.legend': 'What the panel is showing',
  'view.original': 'Original',
  'view.recomposed': 'Recomposed',
  'view.difference': 'Difference',
  'save.title': 'Save the set',
  'save.name': 'Set name',
  'save.author': 'Author',
  'save.url': 'Source URL',
  'save.licence': 'Licence',
  'save.door': 'Door',
  'save.action': 'Save both files',
  'save.done': 'Saved:',
  'save.cancelled': 'Saving cancelled.',
  'save.blocked': 'The annotation does not close yet, so nothing was saved:',
  'harvest.done': 'Palette harvested:',
  'harvest.partial': 'Palette harvested in part, steps left unfilled:',
};

const ES: Dictionary = {
  'app.title': 'pixeldata — anotación semántica',
  'app.tagline': 'Importa pixel art y anota lo que SIGNIFICA cada píxel, para que el color cambie sin que cambie la forma.',
  'zone.accessibility': 'Accesibilidad',
  'zone.work': 'Área de trabajo',
  'zone.explanation': 'Explicación',
  'lang.label': 'Idioma',
  'import.label': 'Abrir pixel art',
  'import.hint': 'Elija uno o más archivos PNG. Nada se envía a ninguna parte: la lectura ocurre en este dispositivo.',
  'import.folder': 'Abrir una carpeta',
  'import.capped': 'La carpeta tiene más archivos que el límite; se leyeron los primeros',
  'import.none': 'Ningún PNG en esa carpeta.',
  'panel.art': 'La imagen, a 4×',
  'panel.colors': 'Los colores, y lo que significa cada uno',
  'panel.samePalette': 'Otras imágenes con la misma paleta',
  'panel.sameDrawing': 'El mismo dibujo, con paletas distintas',
  'state.empty': 'Todavía no hay ninguna imagen abierta.',
  'state.notBuilt': 'Por ahora sólo existe el lector de PNG. Abrir un archivo muestra lo que encontró dentro; los cuatro paneles aún no están conectados.',
  'read.size': 'Dimensiones',
  'read.colorType': 'Tipo de color PNG',
  'read.colors': 'Colores únicos',
  'read.partialAlpha': 'Píxeles con alfa parcial',
  'read.colorChunks': 'Bloques de gestión de color',
  'read.none': 'ninguno',
  'read.failed': 'No se pudo leer este archivo:',
  'colour.nothing': 'nada (transparente)',
  'region.nothing': '— nada —',
  'row.region': 'Región',
  'row.level': 'Nivel',
  'sheet.label': 'Hoja',
  'region.add': 'Nueva región',
  'region.addLabel': 'Nombre de la región a añadir',
  'explain.colours': 'colores',
  'explain.sheets': 'hojas en el conjunto',
  'explain.isolated': 'aislado',
  'explain.refused': 'archivos rechazados',
  'state.notWired': 'Los cuatro paneles están conectados.',
  'view.legend': 'Lo que muestra el panel',
  'view.original': 'Original',
  'view.recomposed': 'Recompuesto',
  'view.difference': 'Diferencia',
  'save.title': 'Guardar el conjunto',
  'save.name': 'Nombre del conjunto',
  'save.author': 'Autor',
  'save.url': 'URL de origen',
  'save.licence': 'Licencia',
  'save.door': 'Puerta',
  'save.action': 'Guardar los dos archivos',
  'save.done': 'Guardado:',
  'save.cancelled': 'Guardado cancelado.',
  'save.blocked': 'La anotación aún no cierra, así que no se guardó nada:',
  'harvest.done': 'Paleta cosechada:',
  'harvest.partial': 'Paleta cosechada en parte, pasos sin rellenar:',
};

const DICTIONARIES: Readonly<Record<Language, Dictionary>> = { 'pt-BR': PT_BR, en: EN, es: ES };

let current: Language = 'pt-BR';

export function setLanguage(language: Language): void {
  current = language;
  document.documentElement.lang = language;
}

export function language(): Language {
  return current;
}

/**
 * ⚠️ A MISSING KEY RETURNS THE KEY, and that is deliberate. Falling back to the pt-BR string would make a
 * hole in a translation look like a finished translation, which is the failure that only shows up in front
 * of the person who needed the other language.
 */
export function t(key: string): string {
  return DICTIONARIES[current][key] ?? key;
}

/** Fill every `data-i18n` element, and every `data-i18n-*` attribute, from the current dictionary. */
export function applyTranslations(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset['i18n']!);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
    el.setAttribute('aria-label', t(el.dataset['i18nLabel']!));
  }
}
