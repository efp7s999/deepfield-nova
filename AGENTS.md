# Working in this repository

This file is for coding agents (Claude Code, Codex and the like). People should start with `README.md`.

## What this is

Deepfield NOVA is one static page, `index.html`, that draws whatever is in `deepfield.json` as a sky: nodes are stars, groups are galaxies, links are streams of light. The page fetches the file every 10 seconds. `SCHEMA.md` is the contract for that file.

**Connecting Deepfield NOVA to someone's systems means writing a program that produces `deepfield.json`. It does not mean editing `index.html`.** That program is called an adapter and lives in `adapters/`.

## When asked to "connect this to my …"

Work through these in order. Do not skip the validator.

1. **Find the source of truth.** Ask the user, in one message and only for what you cannot find out yourself:
   - what should appear (servers, containers, agents, notes, jobs);
   - where that information can be read from on this machine (a command, an API, a file, a database);
   - where `index.html` will be served from, so you know where `deepfield.json` must land.

   Then look for yourself before asking more: try the obvious read-only commands and read their output.

2. **Decide the mapping and tell the user before writing code.** One short table: what is a node, what is a group, what is a link, what are a node's moons, and what makes a node `ok`, `warn`, `bad` or `off`. Usual choices:

   | Source | Node | Group | Moons | Links |
   |---|---|---|---|---|
   | Proxmox, libvirt | host, VM, container | the hypervisor it runs on | its disks or services | backups, replication |
   | Docker, Compose | container | compose project | published ports, volumes | `depends_on`, shared networks |
   | Kubernetes | deployment or node | namespace | pods | services to the workloads they select |
   | Plain hosts over SSH | host | site or role | failed and key systemd units | none unless the user names them |
   | Tailscale, WireGuard | peer | tag or owner | advertised routes | none (a mesh is not a flow) |
   | Prometheus, Uptime Kuma | target or monitor | job or tag | individual checks | none |
   | An agent harness | agent or worker | team or pipeline | its tools or queues | who hands work to whom |
   | A folder of notes | note | top-level folder | headings | links between notes (see `adapters/markdown-vault.mjs`) |

   Status must come from something measured: a health check, an exit code, a threshold the user agrees to. If nothing says whether a thing is healthy, leave `status` out. Do not default to `ok`.

3. **Write the adapter** as `adapters/<source>.mjs` (Node, no dependencies) unless the user prefers another language. Copy the shape of `adapters/local-machine.mjs`. It must:
   - only read from the source. No writes, no restarts, no changes of any kind;
   - put a timeout on every command and request, and carry on without that value if it fails;
   - leave out any field it could not measure. Never write `0`, `""` or `"ok"` as a stand-in;
   - use ids that stay the same between runs (a hostname, a UUID, a path). Never an array index;
   - set `generated` to the current unix time;
   - write to `deepfield.json.tmp` and rename it over `deepfield.json`;
   - accept `--out <path>` and `--watch <seconds>`.

4. **Validate.** Run `node tools/validate.mjs <path to deepfield.json>` and fix the adapter until there are no errors. Read the warnings: each one is something the user will see as a dash, an unknown or a missing item.

5. **Look at it.** Serve the folder (`python3 -m http.server 8080`, or the user's web server) and open the page. The top left must name the user's data, not "demo data".

6. **Keep it fresh.** Offer one of: `--watch`, a systemd timer, a cron entry. Data older than two minutes is flagged as stale on the page, so the interval should be well under that. Do not install a timer or a service without the user saying yes.

7. **Report.** Tell the user what maps to what, what you left out and why, how the file is refreshed, and how to stop it.

## Hard rules

- **No secrets in `deepfield.json`.** Every viewer's browser downloads it. No tokens, keys, passwords, cookies or connection strings. If the adapter needs a credential, it reads it from the environment or a file outside the web root, and nothing derived from it goes in the output. Think before including internal IP addresses, usernames or paths: ask the user if the page will be reachable by anyone else.
- **Read-only access to the user's systems.** If a step would change anything outside this repository, stop and ask.
- **`index.html` stays one self-contained file.** No build step, no libraries, no CDN, no web fonts, no requests other than the data file. Do not add any of these.
- **Do not edit `index.html` to integrate data.** The only part meant for casual editing is the `CONFIG` block at the top of its script (title, data path, poll interval, tour, brightness). Change the drawing code only when the user asks for a visual change.
- **Respect the limits in `SCHEMA.md`** (512 nodes, 32 groups, 1,024 links by default), or raise them the way "Scaling up" below describes. Never let the page silently drop part of someone's estate: either it all fits, or you aggregate, or you raise the limit and say so.
- **Unmeasured is not zero.** This is the rule the whole page is built around.

## Scaling up

A large estate (hundreds of servers, VMs, containers) is expected. Work through these in order and stop at the first that is enough.

1. **Count first.** Run the adapter, then `node tools/validate.mjs deepfield.json`. It reports nodes, groups and links against the limits the page is actually built with.
2. **Group well.** Groups become galaxies, and a galaxy holds a hundred or more stars comfortably. Group by what the user would say out loud: site, cluster, hypervisor, environment, team. Up to 32 groups are drawn; aim for 5 to 20.
3. **Aggregate what nobody looks at one by one.** Forty identical workers are one node named for the pool, `weight` set to the count, the members in `moons` (8 are drawn round the star, 24 listed in the readout), and `status` the worst of them. Keep as their own nodes the things a person would ask about by name.
4. **Thin the links.** Send the links that explain the estate: which service depends on which, which host carries which VM. Collapse parallel links between the same two nodes into one with a higher `rate`. The page dims links as their number grows and brightens the links of whichever star is under the pointer, so a dense file still reads, but a thousand links is a texture and not a diagram.
5. **Raise the limits.** Only if the user wants every item drawn. In `index.html`, edit this one line and nothing else:

   ```js
   const LIMITS = { nodes: 512, groups: 32, links: 1024, sprites: 8000 };
   ```

   | Limit | Safe ceiling | What it costs |
   |---|---|---|
   | `nodes` | 2,048 | Memory only, plus three short loops a frame. Star positions travel to the GPU as a one-row texture, and every WebGL2 device accepts 2,048 texels across. |
   | `groups` | 64 | Each group takes three slots of the shaders' uniform space, and a device is only promised 224 in all. Past 64 some GPUs will refuse to compile. |
   | `links` | 4,096 | One ribbon each. The cost is fill: on a weak GPU, lower Detail before raising this. |
   | `sprites` | 20,000 | Comets on links, moons, meteors. Comets are thinned automatically to fit, so this rarely needs touching. |

   Then reload, check the footer says nothing was left out, and tell the user the new numbers and that Detail (bottom of the page) is the lever if their machine struggles.

More connections between stars are just more entries in `links`: any `kind` string works and each distinct kind gets its own colour from a fixed set. A link with `status` `warn` or `bad` is drawn in amber or red and kept bright even in a crowd.

## If asked to change how it looks

`index.html` is hand-written WebGL2 with sections marked by `/* ── … */` comments, in this order: `CONFIG`, detail levels and limits, shaders, state and GL setup, the frame (`step`, `draw`, `placeLabels`), data (`normalise`, `ingest`, `layout`, `fill`, `demo`), words (labels, panels, readout), input, the viewer's controls, sky events (`spawn`), boot.

Constraints that keep it light, and must survive any change:

- nothing inside `step`, `draw` or `placeLabels` may allocate (no objects, arrays, closures or strings);
- animation is computed in the shaders from the clock; buffers are rewritten only when data changes;
- labels are moved with `transform` only and never measured during a frame;
- the frame loop stops when the tab is hidden, and `prefers-reduced-motion` gets a single still frame;
- no new full-screen passes at full size. The sky (a cube map painted once at start-up, read twice a pixel) and the clouds are drawn into two small off-screen pictures (`sizeBack`, `D.bg`) and enlarged by the `blit` shader. Anything new that is soft and covers much of the view belongs in one of those, not on the canvas;
- anything the same for every pixel of a quad (a clock, an orbit position) is worked out in the vertex shader and handed on `flat`, as the scenery's `vS1` and `vS2` are;
- sky events are scenery. Never drive one from the data file, never let one change a star, and never give one amber or red: those colours mean trouble and nothing else;
- the far scenery (`placeScenery`: a ringed giant and a supernova remnant) is fixed in space behind the estate and is the single exception to that colour rule. The remnant is warm-coloured on purpose. Both pieces move on their own slow clocks (the giant turns, the remnant swells about every twelve seconds) and neither ever reacts to data. Do not add a second warm object, do not tie either to the data file, and keep the remnant's motion slow so it is never mistaken for a warning;
- stars are drawn last, farthest first, as solid discs with a dark surround, so they stay readable over any amount of gas. Keep that order.

## Checking your work

```sh
node tools/validate.mjs deepfield.json        # the data file
node tools/validate.mjs deepfield.sample.json # should report: fine
python3 -m http.server 8080                   # then open http://localhost:8080
```

There is no test suite and no build. If the page shows your data, the validator is clean, and the footer carries no notes about things left out, the integration is done.
