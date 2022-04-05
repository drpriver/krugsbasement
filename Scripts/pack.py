from __future__ import annotations
import PIL # type: ignore
from PIL import Image
import subprocess
import ast
import json
from typing import NamedTuple, Optional, Type, List, Union, Dict, get_type_hints
class StatusIconData(NamedTuple):
    id: int
    name: str
    imgname: str
    def path(self) -> str:
        return f'iconorig/{self.imgname}'
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
]

class TerrainData(NamedTuple):
    id: int
    name:str
    bg_color: str
    imgname: str
    def path(self) -> str:
        return f'tilesorig/{self.imgname}'
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
        return f'tilesorig/{self.imgname}'
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
]


class FixtureData(NamedTuple):
    id: int
    name: str
    imgname: str
    def path(self) -> str:
        return f'miscimgs/{self.imgname}'
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

Data = Union[StatusIconData, TerrainData, TerrainIconData, FixtureData]
Thing = Union[StatusIcon, Terrain, TerrainIcon, Fixture]
OutTypes = [StatusIcon, Terrain, TerrainIcon, Fixture]

def main() -> None:
    proc = subprocess.Popen('Bin/pack', stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    ICONDIM=64
    data: List[Data] = []
    data.extend(ICONS)
    data.extend(TERRAINS)
    data.extend(TERRAIN_ICONS_)
    data.extend(FIXTURES)
    boxless = []
    for i, d in enumerate(data):
        p = d.path()
        if p.endswith('/'):
            boxless.append(d)
            continue
        if 'iconorig' in p:
            w, h = ICONDIM, ICONDIM 
        else:
            img = Image.open(p)
            w, h = img.size
        proc.stdin.write((f'{i},{w},{h}\n').encode('utf-8')) # type: ignore
    proc.stdin.close() # type: ignore
    res = []
    for line in proc.stdout: # type: ignore
        res.append(line.decode('utf-8').strip())
    w, h = ast.literal_eval(res[0])
    path_locs:Dict[str, List] = {ot.key():[] for ot in OutTypes}
    out = Image.new('RGBA', (w, h))
    for line in res[1:]:
        i, x, y, w, h = ast.literal_eval(line)
        path = data[i].path()
        img = Image.open(path)
        if 'iconorig' in path:
            img.thumbnail((ICONDIM, ICONDIM))
        out.paste(img, (x, y))
        th = data[i].as_thing(x, y, w, h)
        path_locs[th.key()].append(list(th))

    for d in boxless:
        th = d.as_thing(0, 0, 0, 0)
        path_locs[th.key()].append(list(th))

    # idk what people are using, but webp on safari
    # requires macos 11.
    # That's new enough to keep the png codepath.
    out.save('Generated/packed.png')
    out.save('Generated/packed.webp')
    with open('Generated/packed.json', 'w') as fp:
        json.dump(path_locs, fp, indent=None)

    with open('Generated/packed.ts', 'w') as s:
        for t in OutTypes:
            print(ts_def(t), file=s)
        print('type Packed = {', file=s)
        for ot in OutTypes:
            print(f'    {ot.key()}: Array<{ot.__name__}>;', file=s)
        print('}', file=s)

    with open('Depends/packed.dep', 'w') as fp:
        print('Generated/packed.ts Generated/packed.webp Generated/packed.png Generated/packed.json: Scripts/pack.py', file=fp, end=' \\\n')
        for d in data:
            p = d.path()
            if p[-1] == '/': continue
            print(' ', p.replace(' ', r'\ '), end=' \\\n', file=fp)
        print(file=fp)
        for d in data:
            p = d.path()
            if p[-1] == '/': continue
            print(p.replace(' ', r'\ ')+':', file=fp)
if __name__ == '__main__':
    main()
