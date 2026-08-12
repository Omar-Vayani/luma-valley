/**
 * lore — what happened here before you arrived.
 *
 * The valley is not procedurally flavoured; it has one history, and the
 * landmarks are its evidence. Walk near one and it enters your journal. The
 * point is that Haven should feel *old* — a settlement with reasons for its
 * shape, a graveyard with names in it, and a ruin nobody talks about.
 */

export interface Era {
  /** Years before the present, as Haven counts them. */
  yearsAgo: number
  title: string
  text: string
}

/** The chronicle the schoolhouse teaches, oldest first. */
export const TIMELINE: Era[] = [
  {
    yearsAgo: 212,
    title: 'The Dust Years',
    text:
      'The old country, Ilvane, went dry in a single generation. What the Luma remember of it is ' +
      'mostly weather: three summers with no rain, then a fourth.',
  },
  {
    yearsAgo: 208,
    title: 'The Coldrun Crossing',
    text:
      'Nine families came over the northern pass with the river as their guide. Six arrived. ' +
      'The Founders\u2019 Stones stand for all nine anyway, which tells you something about them.',
  },
  {
    yearsAgo: 207,
    title: 'The Well',
    text:
      'Before a single roof, they dug. The well in the plaza is the oldest built thing in the valley, ' +
      'and by long habit no one argues within sight of it.',
  },
  {
    yearsAgo: 164,
    title: 'The Flood',
    text:
      'The Coldrun took the first Haven in a spring night. The settlement was rebuilt where it stands ' +
      'now, a deliberate walk back from the water — which is why you fetch fish from so far away.',
  },
  {
    yearsAgo: 141,
    title: 'The Old Bridge',
    text:
      'Stone, three spans, built by a mason whose name is on no document and on every stone: a small ' +
      'chisel-mark shaped like a bird, if you look on the upstream side.',
  },
  {
    yearsAgo: 88,
    title: 'The Beacon',
    text:
      'A watchtower on the southern hill, lit when strangers came up the South Road. It burned in a ' +
      'storm and was never rebuilt; opinion in the tavern remains divided on whether that was laziness or grief.',
  },
  {
    yearsAgo: 61,
    title: 'The Quiet Split',
    text:
      'A disagreement about what belonged to whom emptied a quarter of the houses for a season. Those ' +
      'who left went east to the Hollow. Most came back. The word "hollow" is still an insult here.',
  },
  {
    yearsAgo: 9,
    title: 'The Long Winter',
    text:
      'The last hard one. The Commons Hall fed everybody out of one pot for forty days, and the ' +
      'settlement has kept a shared till ever since.',
  },
]

export type LandmarkKind =
  | 'well' | 'stones' | 'ruin' | 'bridge' | 'wreck' | 'waystone'
  | 'cairn' | 'arch' | 'orchard' | 'tree' | 'mill' | 'shrine'

export interface Landmark {
  id: string
  name: string
  kind: LandmarkKind
  x: number
  z: number
  /** How close you must come for it to enter the journal. */
  radius: number
  /** One line on the compass when you are near. */
  short: string
  /** The journal entry. */
  text: string
}

/**
 * Twelve places worth walking to. Each is a real mesh in the world and a real
 * page in the journal; finding all of them is the valley's quiet collectible.
 */
export const LANDMARKS: Landmark[] = [
  {
    id: 'well',
    name: 'The Founders\u2019 Well',
    kind: 'well',
    x: 0, z: 0, radius: 9,
    short: 'The oldest built thing in the valley.',
    text:
      'Dug before the first roof went up, and still the only water everyone shares. Arguments held ' +
      'within sight of it are considered bad manners, so the plaza is unusually polite for a market square.',
  },
  {
    id: 'stones',
    name: 'The Founders\u2019 Stones',
    kind: 'stones',
    x: -178, z: -58, radius: 20,
    short: 'Nine stones for nine families. Six made it.',
    text:
      'On the western plateau, nine rough pillars in a ring. Three of them mark families that never ' +
      'came over the pass. The Luma who placed them decided that arriving was not the qualification.',
  },
  {
    id: 'watchtower',
    name: 'The Burned Beacon',
    kind: 'ruin',
    x: -124, z: 128, radius: 22,
    short: 'Struck by lightning eighty-eight years ago.',
    text:
      'A watchtower, three storeys once, now a stump of scorched stone with a stair that ends in air. ' +
      'From the top course you can see the whole valley, which is the argument for rebuilding it, and ' +
      'the reason nobody has: everyone would rather be seen from it than climb it.',
  },
  {
    id: 'bridge',
    name: 'The Old Bridge',
    kind: 'bridge',
    x: 121, z: -31, radius: 16,
    short: 'Three spans, one anonymous mason.',
    text:
      'The only dry crossing of the Coldrun. On the upstream face of the middle pier there is a small ' +
      'chisel-mark shaped like a bird. No record names the mason; every child in Haven can find the bird.',
  },
  {
    id: 'wreck',
    name: 'The Sunken Boat',
    kind: 'wreck',
    x: 118, z: 62, radius: 16,
    short: 'Someone tried the lake once.',
    text:
      'Half a hull in the shallows of Mirror Lake, ribs up like a hand. Haven has no boats and no ' +
      'sailors; the story is that a newcomer built it, rowed out at dusk to see the far shore, and came ' +
      'back on foot with nothing to say about it.',
  },
  {
    id: 'waystone',
    name: 'The South Waystone',
    kind: 'waystone',
    x: 20, z: 138, radius: 14,
    short: 'Where travellers first see the roofs.',
    text:
      'A leaning marker at the bend where the South Road crests. Arrivals traditionally touch it before ' +
      'walking down into the valley. It is worn smooth on one side and rough on the other.',
  },
  {
    id: 'cairn',
    name: 'The Northwood Cairn',
    kind: 'cairn',
    x: -70, z: -114, radius: 14,
    short: 'A pile of stones that keeps growing.',
    text:
      'Everyone who walks the northern woods adds a stone. Nobody agrees on what it commemorates, and ' +
      'the disagreement is now older than the memory of the event, so the cairn stands for the argument.',
  },
  {
    id: 'arch',
    name: 'The Fallen Arch',
    kind: 'arch',
    x: -32, z: -138, radius: 18,
    short: 'The gate of a settlement that was never built.',
    text:
      'In the gorge, a stone arch standing alone with nothing on either side of it. It predates the ' +
      'crossing. Whoever cut it was here before the Luma, and left only a door.',
  },
  {
    id: 'orchard',
    name: 'The Bitter Orchard',
    kind: 'orchard',
    x: -104, z: 44, radius: 20,
    short: 'Fruit nobody eats twice.',
    text:
      'Planted in the hungry years from whatever seed came to hand. The trees took, the fruit did not: ' +
      'edible, barely, and famously sour. Kept for what it proves rather than what it grows.',
  },
  {
    id: 'hollowtree',
    name: 'The Hollow Tree',
    kind: 'tree',
    x: 78, z: -52, radius: 14,
    short: 'Where the ones who left used to meet.',
    text:
      'An old trunk wide enough to stand inside, in the Old Grove. During the Quiet Split those who ' +
      'walked out of Haven met here to talk about property. Children now use it to hide from chores.',
  },
  {
    id: 'mill',
    name: 'The Broken Millstone',
    kind: 'mill',
    x: -98, z: -34, radius: 14,
    short: 'The mill that outlived its river.',
    text:
      'The Coldrun ran closer once. When it moved east after the flood, the mill kept turning on a ' +
      'diverted channel for a decade, then stopped. The stone is still here, cracked across the eye.',
  },
  {
    id: 'granary',
    name: 'The Stilted Granary',
    kind: 'mill',
    x: -68, z: 22, radius: 13,
    short: 'Everything they own that matters, up off the ground.',
    text:
      'Four stone legs with stone caps, so the rats cannot climb and the water cannot reach. It was ' +
      'built the spring after the flood and every store since has been built the same way, whether or ' +
      'not the ground floods. Ask a Luma why and they will tell you it is how a granary is built.',
  },
  {
    id: 'tollhouse',
    name: 'The Toll House',
    kind: 'waystone',
    x: 112, z: -26, radius: 13,
    short: 'Nobody has collected a toll here in forty years.',
    text:
      'A one-room stone hut at the near end of the Old Bridge, with a barrier arm that still lowers. ' +
      'The toll paid for the bridge, the bridge was paid for, and the toll went on being collected for ' +
      'eleven years afterwards. The argument that ended it is the reason Haven now votes on things.',
  },
  {
    id: 'emptyhouse',
    name: 'The Empty House',
    kind: 'ruin',
    x: -84, z: -58, radius: 14,
    short: 'Left during the Quiet Split, and never claimed.',
    text:
      'The roof went first, then the door. It has been habitable for decades and nobody has taken it, ' +
      'because taking it would mean deciding whose it was, and the Quiet Split was precisely an argument ' +
      'about that. It is easier to leave it standing empty than to be the one who settles it.',
  },
  {
    id: 'boathouse',
    name: 'The Boathouse',
    kind: 'wreck',
    x: 106, z: 60, radius: 14,
    short: 'A jetty, a hull, and no sailors.',
    text:
      'Built by the same newcomer who rowed out at dusk and walked back. The hull inside is patched and ' +
      'sound and has never been in the water. Haven keeps the boathouse in repair with the same care it ' +
      'gives to everything it has decided not to use.',
  },
  {
    id: 'shrine',
    name: 'The Lantern Shrine',
    kind: 'shrine',
    x: -140, z: 74, radius: 14,
    short: 'A light kept for whoever is still out.',
    text:
      'A niche in the western rocks where a lamp is lit at dusk, in theory every dusk. Whoever passes ' +
      'last is meant to fill it. In practice the tavern keeps a list, and the list is a source of gossip.',
  },
]

export function landmarkById(id: string): Landmark | undefined {
  return LANDMARKS.find((l) => l.id === id)
}

/** The landmark you are close enough to read, if any. */
export function landmarkNear(x: number, z: number): Landmark | null {
  let best: Landmark | null = null
  let bestD = Infinity
  for (const l of LANDMARKS) {
    const d = Math.hypot(l.x - x, l.z - z)
    if (d <= l.radius && d < bestD) {
      bestD = d
      best = l
    }
  }
  return best
}
