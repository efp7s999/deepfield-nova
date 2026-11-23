# The data file

Deepfield NOVA draws one file: `deepfield.json`, sitting beside `index.html`. The page fetches it every 10 seconds. Whatever writes that file decides what the sky shows.

The file is one JSON object. Only `nodes` is required, and a node only needs an `id`. Everything else is optional, and fields the page does not know are ignored.

```json
{
  "nodes": [
    { "id": "web-1", "status": "ok" },
    { "id": "db-1", "status": "bad", "problems": ["replication stopped"] }
  ]
}
```

A complete example is in [`deepfield.sample.json`](deepfield.sample.json). Check any file with `node tools/validate.mjs deepfield.json`.

## Top level

| Field | Type | Meaning |
|---|---|---|
| `nodes` | array | The things to draw. Each becomes a star. |
| `groups` | array | Optional names for groups. Each group becomes a galaxy. |
| `links` | array | Flows between nodes. Each becomes a stream of light. |
| `alerts` | array | Messages for the pill at the top of the page. |
| `title` | string | Shown top left. |
| `generated` | number or string | When the file was written: unix seconds, or an ISO 8601 time. The page uses it to show the data's age, and flags the data as stale after 2 minutes. Leave it out and the age shows as unknown. |

## A node

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Required, unique. Keep it the same from one write to the next: a node's place in the sky is worked out from its id. |
| `label` | string | The name shown. Defaults to the id. |
| `group` | string | The id of its group. Nodes with no group share one unnamed galaxy. |
| `kind` | string | Free text shown in the readout: `server`, `vm`, `agent`, `note`. |
| `status` | string | See the table below. Left out, the node shows as unknown. |
| `weight` | number | Relative size, above 0. Default 1. |
| `metrics` | array or object | Readings, each with an optional bar. See below. |
| `detail` | object | Any other facts, as name and value: `{ "uptime": "38 d" }`. |
| `moons` | array | The node's parts: services, containers, disks, tools. The first 8 orbit the star; all are listed in the readout. |
| `problems` | array of strings | What is wrong, in words. Shown in the readout and in the alert pill. |

### Status

| Value | Drawn as | Also accepted |
|---|---|---|
| `ok` | a blue-white star | up, online, healthy, running, active, good, green, pass |
| `warn` | an amber star with slow rings | warning, degraded, stale, yellow, amber |
| `bad` | a red, flickering star with fast rings | down, error, failed, failing, critical, crit, red |
| `off` | a cold cinder | offline, stopped, inactive, disabled, paused |
| `unknown` | a pale star with a broken ring | anything else, or nothing |

### Metrics

```json
"metrics": [
  { "label": "cpu", "value": 0.42 },
  { "label": "memory", "value": 41.5, "max": 64, "text": "41.5 of 64 GB" },
  { "label": "temperature", "text": "52 °C" },
  { "label": "queue" }
]
```

- `value` from 0 to 1 is a share and gets a bar. Any other number needs `max` to get one.
- `text` is what is printed. Without it, a share prints as a percentage and any other number prints as it is.
- A bar turns amber at 80% and red at 93%. Set the metric's own `status` to decide for yourself.
- A metric with neither `value` nor `text` prints as a dash.
- The shorthand `"metrics": { "cpu": 0.42, "memory": 0.6 }` also works.

### Moons

```json
"moons": [{ "label": "nginx", "status": "ok" }, { "label": "backup", "status": "warn", "text": "9 h ago" }]
```

Plain strings work too: `"moons": ["nginx", "certbot"]`.

## A group

```json
"groups": [{ "id": "prod", "label": "Production" }]
```

A group only needs declaring if you want a label that differs from its id, or a `status` of your own. Otherwise naming it in a node's `group` is enough. A group's status defaults to the worst among its members.

## A link

```json
"links": [{ "from": "web-1", "to": "db-1", "label": "queries", "kind": "sql", "rate": 0.6 }]
```

| Field | Meaning |
|---|---|
| `from`, `to` | Node ids. Light travels from → to. A link whose end is not in `nodes` is not drawn, and the footer says so. |
| `label` | Shown in the readout of both ends. |
| `kind` | Free text. Links of one kind share a colour. |
| `rate` | 0 to 1: how busy it should look. Default 0.5. |
| `status` | `warn` or `bad` colours the link; `off` draws it broken and still. A link is also drawn broken when either end is `off`. |

## An alert

```json
"alerts": [{ "level": "bad", "node": "db-1", "text": "replication stopped" }]
```

`level` is `bad`, `warn` or `info`. `node` is optional. Every entry in a node's `problems` becomes an alert without being listed here, and a `bad` node with no problems gets one saying so. `info` alerts are shown only when nothing more pressing is.

## Three rules

1. **Unmeasured is not zero.** If you could not read a value, leave the field out. The page shows a dash. A `0` is drawn as a real zero.
2. **No secrets.** Every browser that opens the page downloads this file. No tokens, no passwords, nothing you would not print on the wall. The validator flags the obvious ones.
3. **Write it whole.** Write to `deepfield.json.tmp`, then rename it over `deepfield.json`. The page then never reads half a file. If it does get a broken file, it says so and keeps showing the last good one.

## Limits

| | Drawn | Beyond that |
|---|---|---|
| Nodes | 512 | The rest are left out, and the footer says how many. |
| Groups | 32 | The smallest are drawn together as one galaxy. |
| Links | 1,024 | The rest are left out. |
| Metrics per node | 12 | |
| Detail rows per node | 16 | |
| Moons per node | 24 listed, 8 drawn | |

These are the page's defaults, not walls. They live in one `LIMITS` block near the top of the script in `index.html`, and `AGENTS.md` ("Scaling up") says what raising each one costs. The validator reads that block, so it always checks against what the page will really draw.

Before raising anything, ask whether the picture will still read. Past a few hundred stars, a sky is easier to use when each node stands for a set (a rack, a cluster, a namespace, a folder) with its members in `moons`, and when links say which sets talk to each other and not every connection between every pair.

A group's or a node's `label` may also be given as `name` or `title`.
