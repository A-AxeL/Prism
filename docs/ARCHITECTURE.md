# Planet engine

Rocky worlds (`co.kind===0` with the planet engine on) are drawn by the engine in `src/js/planet/`. Everything else (the
Cornell box, black hole, gas giants seen from afar) is the original ray tracer and cosmos renderer in `src/js/app/`.

## Files

| Part | What it does |
| --- | --- |
| `01-terrain-noise.js` | `PE_GLC`/`PE_GLT`: noise, the double-precision octave ladder, continents, mountains, erosion, climate (`terrain()`), atmosphere functions `PE_GLA` |
| `02-weather-clouds.js` | wind by latitude, cloud shapes and density (`PE_GLCLD`), the weather bake (`PE_GLWX`), storms, weather scheduler, cloud uniforms |
| `03-tiles-ground.js` | the tile generator program `PE_TGEN` (all its passes), tile post-pass, terrain vertex and fragment shaders (biomes, close-up detail, water) |
| `04-air-composite.js` | volumetric air and clouds (half resolution), temporal resolve, composite |
| `05-runtime.js` | config (`peCfg`), program build, textures, the tile quadtree and cache, LUTs, probe, env cube, the frame (`peFrame`) |
| `06-trees-shadows.js` | cell layers (shared by trees, grass, rocks), tree species, meshes, impostor bake, trees' draw, the sun shadow map |
| `07-grass.js` | grass clumps, blades built in the vertex shader, wind, light map |
| `08-rocks.js` | rock meshes, scatter rules, draw and shadow casting |

## Scale and precision
Planet radius is 1 in shader units (`uRkm` = radius in km). Geometry near the camera is camera-relative; noise is evaluated
from per-octave base points computed on the CPU in double precision, so detail holds to centimetres on an Earth-sized world.

## A frame (`peFrame`)
1. Config and caches; weather bake step; tile selection and generation (a budget per frame).
2. `peVegFrame` (trees), `peRockFrame` (rocks): keep cells around the camera, scatter new ones, build draw lists.
3. `peShadow`: the sun shadow map near the camera (tree impostors seen from the sun, rock meshes), redrawn only when the camera
   moved a stretch, the sun turned or new things grew. `peGrassFrame`: grass cells, draw lists, light map.
4. Terrain pass into colour + distance targets: tiles, then trees (meshes near, impostors far), rocks, grass.
5. Air and clouds at half resolution, temporal resolve, environment cube face (reflections), composite.

## Tile generator passes (`PE_TGEN`, `uPass`)
| Pass | Purpose |
| --- | --- |
| 0 | a terrain tile (height, water, climate) |
| 1 | probe: height and climate under one point |
| 2 | coarse height cube (long hill shadows) |
| 3 | weather bake (cube) |
| 5 | geography cube |
| 6 | weather probe |
| 7 | latitude-longitude weather map (tools) |
| 8 | tree scatter (one cell) |
| 9 | grass scatter |
| 10 | rock scatter |

## Cell layers
Trees, grass and rocks share `peLayer`: cells of the cube-sphere quadtree at a fixed level (trees about 150 m, rocks 38 m,
grass 9.5 m on Earth), each a 32×32 pool of slots in RGBA32F/RGBA8 textures plus a cell table (relative position and quadratic
map). A scatter pass fills a cell; its kinds are read back asynchronously to list the slots that hold something.

## Quality presets (metres)
| Preset | Mesh trees | Impostors | Shadow map | Grass | Rocks |
| --- | --- | --- | --- | --- | --- |
| potato | – | – | – | – | – |
| battery | – | 400 | – | – | 60 |
| balanced | 90 | 1100 | 1024² | 20 | 120 |
| quality | 130 | 1500 | 2048² | 28 | 180 |
| ultra | 180 | 2200 | 2048² | 36 | 250 |
| cinematic | 240 | 3000 | 2048² | 48 | 350 |

## Time
`PE.wt` is world seconds (advances with Animate at `S.timeSpeed`); `PE.vt` is visual time for animation (capped at 4×).
The planet turns once per `day` hours; clouds drift with the latitude's winds; weather is baked ahead and cross-faded.

## Rebuild keys
`tKey` (terrain), `wxKey` (weather), `vKey` (vegetation): editing only colours keeps tiles, weather and trees.

## Shader build
Core programs (TGEN, TPOST, LUT, TERR, VOL, RES, COMP) are built before the first frame. TREE, IMP, TBAKE, TSHD, ROCK,
RSHD, GRASS, GLIT compile afterwards in the background (`peExtras`), all at once with `KHR_parallel_shader_compile`, else one
per frame. Features check their programs exist, so each switches on when ready.
