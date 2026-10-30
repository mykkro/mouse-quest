export const messages = {
  en: {
    title: 'Mouse Quest', brand: 'Mouse Quest / ten small adventures',
    chooseLevel: 'Choose level', language: 'Language / Jazyk', retry: 'Restart', next: 'Next level →',
    eye: 'Rat-eye view (V)', chase: 'Chase view (V)', camera: 'Toggle camera (V)',
    ready: 'Follow the course to the green beacon.',
    fell: 'A little slip! Press Space to try again.', won: 'Beacon reached!',
    final: 'You reached the final beacon!',
    glue: 'Sticky glue - movement slowed', slip: 'Ice - boosted landing slide; brake early',
    help: '<kbd>W</kbd> / ↑ walk · <kbd>Shift</kbd> run · <kbd>S</kbd> / ↓ back · <kbd>A</kbd><kbd>D</kbd> / ← → turn<br><kbd>Space</kbd> jump — hold for height, move to leap · drag to look around · <kbd>V</kbd> switch view',
  },
  cs: {
    title: 'Příběh krysy', brand: 'Příběh krysy / deset malých dobrodružství',
    chooseLevel: 'Vybrat úroveň', language: 'Jazyk / Language', retry: 'Znovu', next: 'Další úroveň →',
    eye: 'Z očí krysy (V)', chase: 'Pohled zezadu (V)', camera: 'Přepnout pohled (V)',
    ready: 'Dostaň se k zelenému majáku.',
    fell: 'Uklouznutí! Stiskni mezerník a zkus to znovu.', won: 'Maják dosažen!',
    final: 'Poslední maják dosažen!',
    glue: 'Lepidlo – zpomalený pohyb', slip: 'Led – dopad zrychlí skluz; brzdi včas',
    help: '<kbd>W</kbd> / ↑ chůze · <kbd>Shift</kbd> běh · <kbd>S</kbd> / ↓ couvání · <kbd>A</kbd><kbd>D</kbd> / ← → otáčení<br><kbd>Mezerník</kbd> skok — podrž pro vyšší skok, za pohybu skočíš do dálky · rozhlížení tažením myši · <kbd>V</kbd> změna pohledu',
  },
};

export const czechLevels = {
  training: ['První krůčky', 'Najdi jistotu v tlapkách. Úzké lávky, malé výstupy a jeden pořádný skok.'],
  pipes: ['Potrubní bludiště', 'Drž se potrubí. Jantarové lepidlo obejdi, nebo se jím pomalu proder.'],
  rooftops: ['Nad uličkou', 'Cihlové střechy a větrací šachty. Přes dlouhé mezery skákej s rozběhem a Shiftem.'],
  pantry: ['Půlnoční spíž', 'Pod hvězdami a měsícem vylez po bednách a šikmé polici. Lepidlo brzdí, led po dopadu zrychlí skluz.'],
  drains: ['Přes přepad', 'Namrzlé rošty kloužou a dopad na led zrychlí skluz. Brzdi včas a nech si prostor na zastavení.'],
  escape: ['Velký útěk', 'Jantarové lepidlo drží, led po dopadu zrychlí skluz. Dobře si připrav poslední skok.'],
  spiral: ['Vývrtková věž', 'Tři stále užší okruhy až na vrchol. Při pádu tě může zachytit nižší patro; ze dna vede rampa zpět.'],
  skymaze: ['Spletené lávky', 'Čtyři patra křížících se ramp, rozbitých mostů a slepých odboček. Modrá klouže, jantarová lepí. Najdi vrchol.'],
  labyrinth: ['Labyrint nad propastí', 'Čtyři spletitá patra, slepé odbočky a bedny k přeskakování. Najdi zelený maják. Otevřené šachty vedou do prázdna: žádná záchranná podlaha.'],
  clockwork: ['Mechanické přemostění', 'Svez se na tyrkysových plošinách, čekej na jantarových nástupištích. Pruhovaná točna tě otočí. Přeskakuj mezi plošinami; chybný skok končí v propasti.'],
};

export function levelText(level, language) {
  const translated = language === 'cs' ? czechLevels[level.id] : null;
  return translated ? {name: translated[0], description: translated[1]} : level;
}

export function initialLanguage(preferred, saved) {
  if (saved === 'cs' || saved === 'en') return saved;
  return preferred?.toLowerCase().startsWith('cs') ? 'cs' : 'en';
}
