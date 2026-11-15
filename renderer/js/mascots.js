// Theme mascots are real artwork files in renderer/assets/mascots (personal use only).
const PSY = 'assets/mascots/psyduck-art.png';
const SLOW = 'assets/mascots/slowpoke-art.png';
const DUO = 'assets/mascots/duo-diorama.png';
const SCENE = 'assets/mascots/duo-scene.jpg';
const IMG = { psyduck: PSY, yadon: SLOW };
export const duoScene = SCENE;
export const hasMascot = (theme) => theme === 'duo' || !!IMG[theme];
export const mascotURL = (theme) => IMG[theme] || '';
const img = (src, cls) => `<img class="mascot-img ${cls}" src="${src}" alt="" draggable="false">`;

// full artwork (hero / settings preview / sidebar buddy). The duo theme shows both characters together.
export function mascotSVG(theme, cls = '') {
  if (theme === 'duo') return `<img class="duo-art mascot-img ${cls}" src="${DUO}" alt="" draggable="false">`;
  return IMG[theme] ? img(IMG[theme], cls) : '';
}
// sidebar logo: cropped to the face(s), or a monogram for the default theme
export function logoHTML(theme) {
  if (theme === 'duo') return `<div class="logo-duo"><img class="logo-img" src="${DUO}" alt="" draggable="false"></div>`;
  if (!IMG[theme]) return '<div class="mascot-mark">J</div>';
  return `<img class="logo-img" data-t="${theme}" src="${IMG[theme]}" alt="" draggable="false">`;
}

export const MASCOT_LINES = {
  basic: ['Ctrl+K jumps to any page.', 'Type / on an empty line to insert blocks.', 'Link notes with [[double brackets]].', 'Write now, organize later.'],
  psyduck: ['…Quack? My head hurts a little.', 'Don’t panic. Just write it down.', 'Hydrate. Water helps. Probably.', 'Ctrl+K — I forgot what I was doing.', 'Deadlines? Quack.'],
  yadon: ['…… (yawn) oh, hi.', 'Take it slow. Really slow.', 'I’ll finish it… tomorrow.', 'Zzz… still saving your notes.', 'Good job. I think.'],
  duo: ['고라파덕: Quack?! Is that a deadline?', '야돈: …it’s only Thursday.', '고라파덕: My head hurts. 야돈: …mine too. In about an hour.', '야돈: Take it slow. 고라파덕: Slow is too fast!', '고라파덕: Study timer! 야돈: …later.', '야돈: (yawn) Notes are saved. Probably.']
};
// short, in-character lines for the study timer
export const STUDY_LINES = {
  start: { basic: 'Focus started.', psyduck: 'Quack… okay. Focus. Focus.', yadon: '…slowly… starting.', duo: '고라파덕: Quack, go! 야돈: …okay, going.' },
  stop: { basic: 'Session saved.', psyduck: 'Saved! My head hurts less.', yadon: 'Saved… finally.', duo: '야돈: …saved. 고라파덕: Quack!' },
  goal: { basic: 'Daily goal reached!', psyduck: 'GOAL! Quack quack quack!', yadon: '…goal… reached. I think.', duo: '고라파덕: GOAL!! 야돈: …nice.' }
};

export const THEMES = {
  basic: { label: 'Default', blurb: 'Clean indigo, no mascot' },
  psyduck: { label: 'Psyduck', blurb: '고라파덕 — mustard & lake blue' },
  yadon: { label: '야돈', blurb: 'Slowpoke — dusty rose & cream' },
  duo: { label: '고라파덕 & 야돈', blurb: 'Pond — sunny yellow & water blue' }
};
