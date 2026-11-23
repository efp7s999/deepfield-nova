# Connect it with one prompt

## In Claude Code, or another coding agent

Open this folder in the agent and send one message. Change the part in brackets.

```text
Connect this dashboard to [my Proxmox host and the VMs on it]. Follow AGENTS.md.
```

Other things people put in the brackets:

- `the Docker containers on this machine`
- `my three servers: alpha, beta and gamma, over SSH`
- `my Obsidian vault at ~/notes`
- `my agent harness: its state is in ~/harness/status.json`
- `the Kubernetes cluster kubectl is pointed at`

The agent will ask what it cannot work out, show you what it plans to map to what, write an adapter in `adapters/`, check the output with `tools/validate.mjs`, and tell you how the data is kept fresh. It only reads from your systems. `AGENTS.md` tells it not to put secrets in the data file and not to install timers or services without asking.

## In a chat, without access to your machine

Attach `SCHEMA.md` and a sample of your own data (the output of a command, an API response, a status file), then send:

```text
I use Deepfield NOVA, a dashboard that draws the attached SCHEMA.md format as a sky of stars.
Write me a small script with no dependencies that turns my data (also attached) into
deepfield.json in that format. Rules:

- Only read. Never change anything on my systems.
- If a value cannot be measured, leave the field out. Do not write 0 or "ok" as a stand-in.
- No secrets, tokens or passwords in the output: browsers download that file.
- Node ids must stay the same from one run to the next.
- Set "generated" to the current unix time.
- Write to deepfield.json.tmp, then rename it over deepfield.json.
- Take --out <path> and --watch <seconds>.

Before the code, give me a short table: what becomes a node, a group, a link, a moon,
and what makes a node ok, warn, bad or off. Ask me if any of that is a guess.
```

Run the script it gives you, then check the result:

```sh
node tools/validate.mjs deepfield.json
```
