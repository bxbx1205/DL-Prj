/** Short handshape descriptions for the 24 static letters (J and Z need motion). */
export const LETTER_HINTS: Record<string, string> = {
  A: 'Fist, thumb resting against the side of the index finger.',
  B: 'Flat hand, fingers together and straight up, thumb folded across the palm.',
  C: 'Curve fingers and thumb into a C, as if holding a cup.',
  D: 'Index finger up; other fingertips touch the thumb to form a circle.',
  E: 'Fingertips bent down to rest on the thumb, which is tucked across the palm.',
  F: 'Index tip touches thumb tip; other three fingers spread upward.',
  G: 'Index finger and thumb point sideways, parallel, hand turned in.',
  H: 'Index and middle fingers together, pointing sideways.',
  I: 'Little finger up, the rest closed into a fist.',
  K: 'Index and middle up in a V, thumb touching the middle finger between them.',
  L: 'Index finger up and thumb out, forming an L.',
  M: 'Thumb tucked under the first three fingers.',
  N: 'Thumb tucked under the first two fingers.',
  O: 'All fingertips meet the thumb to make an O.',
  P: 'Like K, but pointing down.',
  Q: 'Like G, but pointing down.',
  R: 'Index and middle fingers crossed.',
  S: 'Fist with the thumb wrapped across the front of the fingers.',
  T: 'Thumb tucked between the index and middle fingers.',
  U: 'Index and middle fingers together, pointing up.',
  V: 'Index and middle fingers apart in a V.',
  W: 'Index, middle, and ring fingers spread upward.',
  X: 'Index finger raised and hooked; others closed.',
  Y: 'Thumb and little finger out, middle three fingers closed.',
};

export const LETTERS = Object.keys(LETTER_HINTS);
