# Changelog

## 45 preview 9 (in development)
- Tree shadows near the camera are cast by the trees' own meshes (leaf cards cut out by their pictures, edge-on cards
  dithered), so their edges are soft and dappled instead of saw-toothed; the impostor shadows farther out start at the trunk.
- Trees: four builds of every species and each tree stretched on its own, so no two look alike; tall savanna grass;
  more shrubs in dense forest; brighter shrubs.
- Rock types: each region has its own bedrock (basalt, sandstone, red beds, limestone, shale, granite; on Mars basalt,
  light sulfate beds and hematite), and slopes show its beds as coloured bands 150 m, 45 m and 9 m thick.
- Mars and other dry worlds: layered rock, its hard beds left standing as ledges (Mount Sharp's look); hummocky plains;
  bright dust mantles and dark sand sheets; no more pockmarks or shifting stone shadows on the photo ground.
- PC preset: 1024 px textures, 1024 weather cubes, 128³ cloud noise, more cloud steps, 4096 shadows, wider ranges.
- Photo-scanned textures (30 CC0 scans from Poly Haven: grass, soils, sands, rock, snow, Mars ground, bark), packed by
  tools/textures.html and blended by height on the ground, on rocks and on bark.
- Clouds rebuilt after shader packs (Nubis, Photon): GPU-made 128³ noise, crisp heaps eroded into billows (cauliflower
  tops, wisps at the base), many-bounce lighting with silver linings, sky light dimmed under the cloud above; a new
  altocumulus layer (mackerel sky); smooth cirrus; cloud bases ride over high ground; sharper cloud shadows; fixed the
  history reset that left clouds noisy and smeared; short steps inside clouds so small heaps are solid.
- Mars dust storms: storms rise over basins, low plains and the polar cap edges, drift with the winds, and tower in
  fronts at their edges; inside one the sky turns ochre and shadows go soft.
- Trees grow as branch systems (trunk, limbs, branches, twigs with leaf clusters) with photo bark; two mesh levels.
- Rocks: eight broken shapes (blocks, wedges, slabs, ledgy blocks, pitted lava, cobbles) in three levels of detail.
- Terrain: landforms (flat plains to rugged highlands, ridges and broad valleys), sharper mountain crests, river valleys
  with channels (water where it rains), lakes in the hollows of the land; wind ripples on sand; fewer tiny craters.
- Fixed: walls of water at the edges of lake districts; triangle patterns on Mars (a hash that fails on Windows GPUs);
  pebbles and tree crowns lit upside down (they looked like pits); dark lines across acacia crowns.
- Dev server serves a light page (textures from assets/) and restarts itself after any crash.
- Planet loads in seconds on Windows (was minutes): the terrain generator is compiled once instead of a dozen times, its
  loops are kept as loops, and the weather passes are a separate program that compiles alongside it.
- Rocks: no snow on worlds without moisture (Mars); coarse meshes beyond the nearest cells (3× faster on Mars).
- Project reorganized into a source tree with a build, dev server with live reload and GPU tests.
- 3D rocks: boulders and scree under steep ground, desert stones, shore rocks, erratics; lichen, moss, dust, snow; they cast shadows.
- Ferns on the forest floor; brighter light under the canopy; deep forest darker toward its interior.
- Acacia crowns of many small, tilted leaf clusters.
- Faster start: tree, grass, rock and shadow shaders compile in the background after the first picture (one at a time in
  browsers without parallel shader compiling, such as Firefox), each feature switching on as its shader is ready.

## 45 preview 8.2
- Real time scale and a time-speed slider (real time to one day per second).
- Living weather: storms that form, drift and decay; changing cloud cover; clouds reflected in water near the camera.
- 3D forests by climate (spruce, pine, broadleaf, birch, rainforest, palm, acacia, shrubs, cacti) with impostors far out.
- Sun shadows from trees on the ground, trunks and grass; forest-floor litter and moss; bark furrows; root flare.
- 3D grass blown by gusts of wind: meadow, savanna tussocks, tundra sedge, forest shade grass.
- Planet editor modules: Land, Climate, Air (storms), Orbit (day length).
