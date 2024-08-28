from __future__ import annotations
import PIL
from PIL import Image
import ast
import json
import packrect
from typing import NamedTuple, Type, Union, get_type_hints, Any, IO, Sequence
def textopen(path:str, mode:str) -> IO[Any]:
    return open(path, mode, encoding='utf-8')

class StatusIconData(NamedTuple):
    id: int
    name: str
    imgname: str
    def path(self) -> str:
        return f'Imgs/iconorig/{self.imgname}'
    def as_thing(self, x:int, y:int, w:int, h:int) -> StatusIcon:
        return StatusIcon(self.id, self.name, x, y, w, h)

class StatusIcon(NamedTuple):
    id: int
    name: str
    x: int
    y: int
    w: int
    h: int
    @staticmethod
    def key() -> str:
        return 'status_icons'

def ts_def(nt:Type[NamedTuple]) -> str:
    r = f'type {nt.__name__} = ['
    for k, cls in get_type_hints(nt).items():
        if cls is str:
            r += 'string'
        elif cls is int:
            r += 'number'
        else:
            raise TypeError
        r += ', '
    r = r[:-2]
    r += '];'
    return r

ICONS = [
    StatusIconData( 0, 'Asleep',      'Asleep.png',       ),
    StatusIconData( 1, 'Bless',       'Blessed.png',      ),
    StatusIconData( 2, 'Blinded',     'Blinded.png',      ),
    StatusIconData( 3, 'Charmed',     'Charmed.png',      ),
    StatusIconData( 4, 'Confused',    'Confused.png',     ),
    StatusIconData( 5, 'Deafened',    'Deafened.png',     ),
    StatusIconData( 6, 'Fear',        'Fear.png',         ),
    StatusIconData( 7, 'Grappling',   'Grappling.png',    ),
    StatusIconData( 8, 'Haste',       'Haste.png',        ),
    StatusIconData( 9, 'Invisible',   'Invisible.png',    ),
    StatusIconData(10, 'OnFire',      'OnFire.png',       ),
    StatusIconData(11, 'Paralyzed',   'Paralyzed.png',    ),
    StatusIconData(12, 'Poisoned',    'Poisoned.png',     ),
    StatusIconData(13, 'Prone',       'Prone.png',        ),
    StatusIconData(14, 'Restrained',  'Restrained.png',   ),
    StatusIconData(15, 'Stunned',     'Stunned.png',      ),
    StatusIconData(16, 'Blink',       'Blink.png',      ),
    StatusIconData(17, 'Blur',        'Blur.png',      ),
    StatusIconData(18, 'Strength',    'Strength.png',      ),
    StatusIconData(19, 'Shield of Faith',     'Shield of Faith.png',      ),
    StatusIconData(20, 'Acted',     'Holding Action.png',      ),
]

class TerrainData(NamedTuple):
    id: int
    name:str
    bg_color: str
    imgname: str
    def path(self) -> str:
        return f'Imgs/tilesorig/{self.imgname}'
    def as_thing(self, x:int, y:int, w:int, h:int) -> Terrain:
        return Terrain(self.id, self.name, self.bg_color, x, y, w, h)

class Terrain(NamedTuple):
    id: int
    name: str
    bg_color: str
    x: int
    y: int
    w: int
    h: int
    @staticmethod
    def key() -> str:
        return 'terrain'

TI = TerrainData
TERRAINS = [
    TI( 0,  'No Terrain',               '#ccccccff',    ''                          ),
    TI( 1,  'Sea',                      '#99ccffff',    ''                          ),
    TI( 2,  'Beach',                    '#fff899ff',    'beach.png'                 ),
    TI( 3,  'Dead Forest Hills',        '#a0a0a0ff',    'deadforesthills.png'       ),
    TI( 4,  'Dead Forest Mountain',     '#909090ff',    'deadforestmountain.png'    ),
    TI( 5,  'Dead Forest Mountains',    '#808080ff',    'deadforestmountains.png'   ),
    TI( 6,  'Dead Forest',              '#b0b0b0ff',    'deadforest.png'            ),
    TI( 7,  'Dead Forest Wetlands',     '#808080ff',    'deadforestwetlands.png'    ),
    TI( 8,  'Dunes',                    '#ffff99ff',    'dunes.png'                 ),
    TI( 9,  'Evergreen Hills',          '#488a21ff',    'evergreenhills.png'        ),
    TI(10,  'Evergreen Mountain',       '#577621ff',    'evergreenmountain.png'     ),
    TI(11,  'Evergreen Mountains',      '#667621ff',    'evergreenmountains.png'    ),
    TI(12,  'Evergreen',                '#39912dff',    'evergreen.png'             ),
    TI(13,  'Evergreen Wetlands',       '#488a40ff',    'evergreenwetlands.png'     ),
    TI(14,  'Forested Hills',           '#8ebd52ff',    'forestedhills.png'         ),
    TI(15,  'Forested Mountain',        '#86a233ff',    'forestedmountain.png'      ),
    TI(16,  'Forested Mountains',       '#879233ff',    'forestedmountains.png'     ),
    TI(18,  'Forest Wetlands',          '#879253ff',    'forestwetlands.png'        ),
    TI(19,  'Farmland',                 '#a0d867',      ''                          ),
    TI(17,  'Cultivated Farmland',      '#a0d867',      'cultivatedfarmland.png'    ),
    TI(20,  'Rich Grassland',           '#a0d867',      'grassland.png'             ),
    TI(21,  'Glacier',                  '#e6ffffff',    'glacier.png'               ),
    TI(22,  'Grassland Hills',          '#d7f796ff',    'grasslandhills.png'        ),
    TI(23,  'Grassland',                '#e7f79cff',    'grassland.png'             ),
    TI(25,  'Grassy Hills',             '#c3d263ff',    'grassyhills.png'           ),
    TI(26,  'Heavy Cactus',             '#b2b200ff',    'heavycactus.png'           ),
    TI(27,  'Heavy Evergreen',          '#2f7621ff',    'heavyevergreen.png'        ),
    TI(29,  'Heavy Forest',             '#7aad43ff',    'heavyforest.png'           ),
    TI(30,  'Hills',                    '#e7ce5aff',    'hills.png'                 ),
    TI(31,  'Iceflow',                  '#cbffffff',    'iceflow.png'               ),
    TI(32,  'Jungle Hills',             '#468552ff',    'junglehills.png'           ),
    TI(33,  'Light Jungle',             '#559e64ff',    'junglelight.png'           ),
    TI(34,  'Jungle Mountain',          '#3f7b4aff',    'junglemountain.png'        ),
    TI(35,  'Jungle Mountains',         '#367142ff',    'junglemountains.png'       ),
    TI(36,  'Jungle',                   '#4d8f5aff',    'jungle.png'                ),
    TI(37,  'Jungle Wetlands',          '#46855cff',    'junglewetlands.png'        ),
    TI(38,  'Heavy Kelp Forest',        '#99f0ffff',    'kelpforestheavy.png'       ),
    TI(39,  'Kelp Forest',              '#99e0ffff',    'kelpforest.png'            ),
    TI(40,  'Lava',                     '#ff9900ff',    'lava.png'                  ),
    TI(41,  'Light Forest',             '#95c663ff',    'lightforest.png'           ),
    TI(42,  'Marsh',                    '#84ce94ff',    'marsh.png'                 ),
    TI(43,  'Heavy Mixed Forest',       '#4f8a3bff',    'mixedforestheavy.png'      ),
    TI(44,  'Mixed Forest Hills',       '#74a33aff',    'mixedforesthills.png'      ),
    TI(45,  'Mixed Forest Mountain',    '#69872bff',    'mixedforestmountain.png'   ),
    TI(46,  'Mixed Forest Mountains',   '#74852bff',    'mixedforestmountains.png'  ),
    TI(47,  'Mixed Forest',             '#4f9e45ff',    'mixedforest.png'           ),
    TI(48,  'Moor',                     '#a0d79dff',    'moor.png'                  ),
    TI(49,  'Mountain',                 '#c68f00ff',    'mountain.png'              ),
    TI(50,  'Mountains',                '#b28000ff',    'mountains.png'             ),
    TI(51,  'Reefs',                    '#99ccffff',    'reefs.png'                 ),
    TI(52,  'Rocky Desert',             '#f0e171ff',    'rockydesert.png'           ),
    TI(53,  'Sand Desert',              '#f8f085ff',    'sandydesert.png'           ),
    TI(54,  'Savanna',                  '#d2f896ff',    'savanna.png'               ),
    TI(55,  'Shrubland Hills',          '#dadc71ff',    'shrublandhills.png'        ),
    TI(56,  'Shrubland',                '#dadc80ff',    'shrubland.png'             ),
    TI(57,  'Snowcapped Mountain',      '#c68f00ff',    'snowcappedmountain.png'    ),
    TI(58,  'Snowcapped Mountains',     '#b28000ff',    'snowcappedmountains.png'   ),
    TI(59,  'Snowfields',               '#ffffffff',    'snowfields.png'            ),
    TI(60,  'Swamp',                    '#addea5ff',    'swamp.png'                 ),
    TI(61,  'Broken',                   '#c59d34ff',    'brokenlands.png'           ),
]


class TerrainIconData(NamedTuple):
    id: int
    name: str
    imgname: str
    def path(self) -> str:
        return f'Imgs/tilesorig/{self.imgname}'
    def as_thing(self, x:int, y:int, w:int, h:int) -> TerrainIcon:
        return TerrainIcon(self.id, self.name, x, y, w, h)

class TerrainIcon(NamedTuple):
    id: int
    name: str
    x: int
    y: int
    w: int
    h: int
    @staticmethod
    def key() -> str:
        return 'terrain_icons'

TERRAIN_ICONS_ = [
    TerrainIconData( 0, 'Town',         'town.png'      ),
    TerrainIconData( 1, 'Temple',       'temple.png'    ),
    TerrainIconData( 2, 'Tower',        'tower.png'     ),
    TerrainIconData( 3, 'Village',      'village.png'   ),
    TerrainIconData( 4, 'Cave',         'cave.png'      ),
    TerrainIconData( 5, 'Castle',       'castle.png'    ),
    TerrainIconData( 6, 'Ruins',        'ruins.png'     ),
    TerrainIconData( 7, 'Ruinedcity',   'ruinedcity.png'),
    TerrainIconData( 8, 'Shrine',       'shrine.png'    ),
    TerrainIconData( 9, 'Totem',        'totem.png'     ),
    TerrainIconData(10, 'Fort',         'fort.png'      ),
    TerrainIconData(11, 'Pyramid',      'pyramid.png'   ),
    TerrainIconData(12, 'Port',         'port.png'      ),
    TerrainIconData(13, 'Landmark',     'landmark.png'  ),
    TerrainIconData(14, 'City',         'city.png'      ),
    TerrainIconData(15, 'Clanmoot',     'clanmoot.png'  ),
    TerrainIconData(16, 'Palace',       'palace.png'    ),
    TerrainIconData(17, 'Statue',       'statue.png'    ),
    TerrainIconData(18, 'Cathedral',    'cathedral.png' ),
    TerrainIconData(19, 'Camp',         'camp.png'      ),
    TerrainIconData(20, 'Church',       'church.png'    ),
    TerrainIconData(21, 'Crossbones',   'crossbones.png'),
    TerrainIconData(22, 'Dungeon',      'dungeon.png'   ),
    TerrainIconData(23, 'Windmill',     'windmill.png'  ),
    TerrainIconData(24, 'TeePee',       'teepee.png'    ),
    TerrainIconData(25, 'Trap',         'trap.png'      ),
    TerrainIconData(26, 'WayStation',   'waystation.png'),
    TerrainIconData(27, 'Bear',         'bear.png'      ),
    TerrainIconData(28, 'Campsite',     'campsite.png'  ),
    TerrainIconData(29, 'Catapult',     'catapult.png'  ),
    TerrainIconData(30, 'Dragon',       'dragon.png'    ),
    TerrainIconData(31, 'Crater',       'crater.png'    ),
    TerrainIconData(32, 'Mines',        'mines.png'     ),
    TerrainIconData(33, 'TombStone',    'tombstone.png' ),
    TerrainIconData(34, 'Leaf',         'plant.png'     ),
    TerrainIconData(35, 'Monolith',     'monolith.png'  ),
    TerrainIconData(36, 'Lion',         'lion.png'      ),
    TerrainIconData(37, 'Monument',     'monument.png'  ),
]
def verify() -> None:
    tiids:set = set()
    tinames:set = set()
    tips:set = set()
    def c(s:set, i:Any) -> None:
        if i in s: raise Exception
        s.add(i)
    for ti in TERRAIN_ICONS_:
        c(tiids, ti.id)
        c(tinames, ti.name)
        c(tips, ti.imgname)
verify()
del verify


class FixtureData(NamedTuple):
    id: int
    name: str
    imgname: str
    def path(self) -> str:
        return f'Imgs/miscimgs/{self.imgname}'
    def as_thing(self, x:int, y:int, w:int, h:int) -> Fixture:
        return Fixture(self.id, self.name, x, y, w, h)

class Fixture(NamedTuple):
    id: int
    name: str
    x: int
    y: int
    w: int
    h: int
    @staticmethod
    def key() -> str:
        return 'fixtures'

FIXTURES = [
    FixtureData(0, 'Rubble', 'rubble.png'),
]

class TokenData(NamedTuple):
    id: int
    name: str
    imgname: str
    def path(self) -> str:
        return f'Imgs/tokens/{self.imgname}'
    def as_thing(self, x:int, y:int, w:int, h:int) -> Token:
        return Token(self.id, self.name, x, y, w, h)

class Token(NamedTuple):
    id: int
    name: str
    x: int
    y: int
    w: int
    h: int
    @staticmethod
    def key() -> str:
        return 'tokens'
TOKENS = [
    TokenData( 0, 'advent.png',          'advent.png'),
    TokenData( 1, 'adventurer.png',      'adventurer.png'),
    TokenData( 2, 'bandit.png',          'bandit.png'),
    TokenData( 3, 'banus.png',           'banus.png'),
    TokenData( 4, 'based-skele.png',     'based-skele.png'),
    TokenData( 5, 'beard.png',           'beard.png'),
    TokenData( 6, 'beard2.png',          'beard2.png'),
    TokenData( 7, 'beard3.png',          'beard3.png'),
    TokenData( 8, 'beard4.png',          'beard4.png'),
    TokenData( 9, 'beardorc.png',        'beardorc.png'),
    TokenData(10, 'biceps.png',          'biceps.png'),
    TokenData(11, 'bunnedorc.png',       'bunnedorc.png'),
    TokenData(12, 'capitan.png',         'capitan.png'),
    TokenData(13, 'centipede.png',       'centipede.png'),
    TokenData(14, 'chops.png',           'chops.png'),
    TokenData(15, 'cler.png',            'cler.png'),
    TokenData(16, 'cleric.png',          'cleric.png'),
    TokenData(17, 'coldandthin.png',     'coldandthin.png'),
    TokenData(18, 'coldwarr.png',        'coldwarr.png'),
    TokenData(19, 'cynic.png',           'cynic.png'),
    TokenData(20, 'dark.png',            'dark.png'),
    TokenData(21, 'defender.png',        'defender.png'),
    TokenData(22, 'defender2.png',       'defender2.png'),
    TokenData(23, 'demongirl.png',       'demongirl.png'),
    TokenData(24, 'dredds.png',          'dredds.png'),
    TokenData(25, 'druid.png',           'druid.png'),
    TokenData(26, 'dwarf1.png',          'dwarf1.png'),
    TokenData(27, 'dwarf2.png',          'dwarf2.png'),
    TokenData(28, 'dwarf3.png',          'dwarf3.png'),
    TokenData(29, 'dwarfberserk.png',    'dwarfberserk.png'),
    TokenData(30, 'elf2.png',            'elf2.png'),
    TokenData(31, 'elfwiz.png',          'elfwiz.png'),
    TokenData(32, 'enforcer.png',        'enforcer.png'),
    TokenData(33, 'fancy.png',           'fancy.png'),
    TokenData(34, 'femwarrior.png',      'femwarrior.png'),
    TokenData(35, 'fighter.png',         'fighter.png'),
    TokenData(36, 'fighter2.png',        'fighter2.png'),
    TokenData(37, 'fighter3.png',        'fighter3.png'),
    TokenData(38, 'fire.png',            'fire.png'),
    TokenData(39, 'firemage.png',        'firemage.png'),
    TokenData(40, 'flameman.png',        'flameman.png'),
    TokenData(41, 'flameman2.png',       'flameman2.png'),
    TokenData(42, 'gb.png',              'gb.png'),
    TokenData(43, 'gelf.png',            'gelf.png'),
    TokenData(44, 'ghoul.png',           'ghoul.png'),
    TokenData(45, 'glowie.png',          'glowie.png'),
    TokenData(46, 'gnome.png',           'gnome.png'),
    TokenData(47, 'goatman.png',         'goatman.png'),
    TokenData(48, 'goblin.png',          'goblin.png'),
    TokenData(49, 'hooded.png',          'hooded.png'),
    TokenData(50, 'hoodie.png',          'hoodie.png'),
    TokenData(51, 'horned.png',          'horned.png'),
    TokenData(52, 'jonas.png',           'jonas.png'),
    TokenData(53, 'kevin.png',           'kevin.png'),
    TokenData(54, 'lavaguy.png',         'lavaguy.png'),
    TokenData(55, 'lizardbrute.png',     'lizardbrute.png'),
    TokenData(56, 'lizardflail.png',     'lizardflail.png'),
    TokenData(57, 'lizardguy.png',       'lizardguy.png'),
    TokenData(58, 'lizardman.png',       'lizardman.png'),
    TokenData(59, 'lizardspear.png',     'lizardspear.png'),
    TokenData(60, 'loxodon-assasin.png', 'loxodon-assasin.png'),
    TokenData(61, 'loxodon-enforcer.png','loxodon-enforcer.png'),
    TokenData(62, 'loxodon.png',         'loxodon.png'),
    TokenData(63, 'masked.png',          'masked.png'),
    TokenData(64, 'maskorc.png',         'maskorc.png'),
    TokenData(65, 'melvin.png',          'melvin.png'),
    TokenData(66, 'misunderstood.png',   'misunderstood.png'),
    TokenData(67, 'ogre.png',            'ogre.png'),
    TokenData(68, 'orctough.png',        'orctough.png'),
    TokenData(69, 'original.png',        'original.png'),
    TokenData(70, 'pirate.png',          'pirate.png'),
    TokenData(71, 'rough.png',           'rough.png'),
    TokenData(72, 'saddog.png',          'saddog.png'),
    TokenData(73, 'shazam.png',          'shazam.png'),
    TokenData(74, 'ship.png',            'ship.png'),
    TokenData(75, 'shoulderpads.png',    'shoulderpads.png'),
    TokenData(76, 'skeleto.png',         'skeleto.png'),
    TokenData(77, 'skelewiz.png',        'skelewiz.png'),
    TokenData(78, 'smolder.png',         'smolder.png'),
    TokenData(79, 'snakeheaded.png',     'snakeheaded.png'),
    TokenData(80, 'snakewoman.png',      'snakewoman.png'),
    TokenData(81, 'snooty.png',          'snooty.png'),
    TokenData(82, 'sorceress.png',       'sorceress.png'),
    TokenData(83, 'thief.png',           'thief.png'),
    TokenData(84, 'thief2.png',          'thief2.png'),
    TokenData(85, 'thorlet.png',         'thorlet.png'),
    TokenData(86, 'troll.png',           'troll.png'),
    TokenData(87, 'tyrone.png',          'tyrone.png'),
    TokenData(88, 'uggh.png',            'uggh.png'),
    TokenData(89, 'whiteorc.png',        'whiteorc.png'),
    TokenData(90, 'wilsbeard.png',       'wilsbeard.png'),
    TokenData(91, 'wiz.png',             'wiz.png'),
    TokenData(92, 'wiz2.png',            'wiz2.png'),
    TokenData(93, 'wiz3.png',            'wiz3.png'),
    TokenData(94, 'woman.png',           'woman.png'),
    TokenData(95, 'woman2.png',          'woman2.png'),
    TokenData(96, 'wrestler.png',        'wrestler.png'),
]

Data = Union[StatusIconData, TerrainData, TerrainIconData, FixtureData, TokenData]
Thing = Union[StatusIcon, Terrain, TerrainIcon, Fixture, Token]
OutTypes: list[Type[StatusIcon | Terrain | TerrainIcon | Fixture | Token]] = [StatusIcon, Terrain, TerrainIcon, Fixture, Token]
ICONDIM=64
def run_pack(data:Sequence[Data], path_locs:dict[str, list]) -> Image:
    boxless = []
    boxed = []
    for d in data:
        p = d.path()
        if p.endswith('/'):
            boxless.append(d)
            continue
        if 'iconorig' in p:
            w, h = ICONDIM, ICONDIM
        else:
            img = Image.open(p)
            w, h = img.size
        boxed.append((w, h, d))
    res, w, h = packrect.pack(boxed, max_iters=25)
    out = Image.new('RGBA', (w, h))
    for rect in res:
        x, y, w, h, d = rect
        path = d.path()
        img = Image.open(path)
        if 'iconorig' in path:
            img.thumbnail((ICONDIM, ICONDIM))
        out.paste(img, (x, y))
        th = d.as_thing(x, y, w, h)
        path_locs[th.key()].append(list(th))

    for d in boxless:
        th = d.as_thing(0, 0, 0, 0)
        path_locs[th.key()].append(list(th))
    return out

def add_deps(data:Sequence[Data], fp: IO[Any]) -> None:
        for d in data:
            p = d.path()
            if p[-1] == '/': continue
            print(' ', p.replace(' ', r'\ '), end=' \\\n', file=fp)
        print(file=fp)
        for d in data:
            p = d.path()
            if p[-1] == '/': continue
            print(p.replace(' ', r'\ ')+':', file=fp)

def main() -> None:
    data: list[Data] = []
    data.extend(ICONS)
    data.extend(TERRAINS)
    data.extend(TERRAIN_ICONS_)
    data.extend(FIXTURES)
    path_locs:dict[str, list] = {ot.key():[] for ot in OutTypes}
    out = run_pack(data, path_locs)
    tokout = run_pack(TOKENS, path_locs)

    # idk what people are using, but webp on safari
    # requires macos 11.
    # That's new enough to keep the png codepath.
    out.save('Generated/packed.png')
    out.save('Generated/packed.webp')
    with textopen('Generated/packed.json', 'w') as fp:
        json.dump(path_locs, fp, indent=None)

    with textopen('Generated/packed.ts', 'w') as s:
        for t in OutTypes:
            print(ts_def(t), file=s)
        print('type Packed = {', file=s)
        for ot in OutTypes:
            print(f'    {ot.key()}: Array<{ot.__name__}>;', file=s)
        print('}', file=s)

    with textopen('Depends/packed.dep', 'w') as fp:
        print('Generated/packed.ts: Scripts/pack.py', file=fp)
        print('Generated/packed.webp Generated/packed.png Generated/packed.json: Scripts/pack.py', file=fp, end=' \\\n')
        add_deps(data, fp)
        print('Generated/toks.webp Generated/toks.png Generated/packed.json: Scripts/pack.py', file=fp, end=' \\\n')
        add_deps(TOKENS, fp)
    tokout.save('Generated/toks.webp')
    tokout.save('Generated/toks.png')

if __name__ == '__main__':
    main()
