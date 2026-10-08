<div align="center">

# ViaFrei

[![Smithery](https://img.shields.io/badge/Smithery-viafrei-ff5a1f)](https://smithery.ai/servers/viafrei/viafrei)
[![npm](https://img.shields.io/npm/v/viafrei)](https://www.npmjs.com/package/viafrei)
[![Glama](https://glama.ai/mcp/servers/mavrovde/viafrei-mcp/badge)](https://glama.ai/mcp/servers/mavrovde/viafrei-mcp)

### Germany's traffic, trains, charging and roads — in your AI assistant.

**Ask in plain words. Get the live answer, with its source.**

[![website](https://img.shields.io/badge/viafrei.de-live-0b5fff?logo=googlechrome&logoColor=white)](https://viafrei.de/en)
[![node](https://img.shields.io/node/v/viafrei?logo=node.js&logoColor=white)](https://nodejs.org)
[![licence](https://img.shields.io/npm/l/viafrei?color=blue)](LICENSE)
[![no API key](https://img.shields.io/badge/API%20key-none-brightgreen)](#-connect-in-one-minute)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-6f42c1)](https://modelcontextprotocol.io)

**[viafrei.de](https://viafrei.de/en)** · [Connect your assistant](https://viafrei.de/en/connect) · [For developers](https://viafrei.de/en/developers) · [For businesses](https://viafrei.de/en/business) · [All tools](#-everything-it-can-do) · [API reference](API.md)

</div>

---

```
claude mcp add --transport http viafrei https://mcp.viafrei.de/mcp
```

**Free. No account, no API key, no sign-up.** One line and your assistant knows
whether the A8 is jammed, whether your train is late, where the nearest
Type 2 charger is (and whether it is free, where the operator publishes that)
and whether the lift at your station works — from official
German open data, live, with the source named in every answer.

> **Beta.** ViaFrei is being stabilised: sources are still being added, and
> answers and coverage can change. The answers are written by an AI assistant
> from our data, and AI can make mistakes, so check anything important (a
> closure, a departure, a price) against the source each answer names.

> **New in 1.8:** a twenty-first tool, **`find_sharing`**, for shared bikes
> (nextbike and Donkey Republic). **Berlin and Brandenburg** punctuality now
> comes from VBB's own realtime feed. Road answers now include police and city
> traffic reports from Baden-Württemberg, Schleswig-Holstein and Berlin (and
> from Köln and Hannover whenever those cities publish one), and roadworks on
> Bundes- and Landesstraßen in Niedersachsen, Sachsen and Thüringen. **Charging** gains the Bundesnetzagentur register and
> more live status, and **parking** gains Hamburg, Münster and NRW car parks.
> Every source is listed in [SOURCES.md](SOURCES.md).

---

## 🧳 What you can ask

You don't need to know any tool names. Ask the way you'd ask a friend who
happens to have every German traffic feed open. German or English; the answer
comes back in the language you asked in.

| when you're… | ask |
|---|---|
| 🌅 **about to commute** | *Fahren Busse und Bahnen in Bayern gerade pünktlich?* · *When does the next train leave Hamburg Hbf?* |
| 🚗 **about to drive** | *Gibt es Stau auf der A8?* · *Are there roadworks on the A7 next week?* · *Is the A1 closed anywhere?* |
| 🚧 **stuck in traffic** | *How much time is the jam on the A3 between Frankfurt and Würzburg costing right now?* · *Is traffic backed up on the Cologne motorway ring — A1, A3 or A4?* · *Ist der Elbtunnel auf der A7 heute Nacht gesperrt?* |
| ⚡ **driving electric** | *Where can I charge with Type 2 near Leipzig?* · *Wo gibt es einen Schnelllader mit 150 kW bei Nürnberg?* |
| 🅿️ **driving a lorry** | *Find a rest area with lorry parking on the A9* · *Wo ist der nächste Lkw-Parkplatz an der A7?* |
| ♿ **travelling step-free** | *Funktioniert der Aufzug am Bahnhof Köln Messe/Deutz?* |
| 🌦️ **watching the weather** | *Gibt es eine Unwetterwarnung für Freiburg?* |
| 📍 **looking for a place** | *What is the address of the Elbphilharmonie in Hamburg?* · *Welche Apotheken gibt es in Fulda?* · *My satnav shows 50.1109, 8.6821 — what address is that?* |
| 🇩🇪 **new to German roads** | *Do I need an emission sticker for Stuttgart?* · *Is there a speed limit on the Autobahn?* |
| ⏳ **waiting for news** | *Tell me as soon as the closure on the A7 is lifted.* · *Sag mir Bescheid, wenn in Köln ein Viertel oder mehr der Bus- und Bahnfahrten verspätet ist.* · *Warn me when a DWD severe-weather warning comes into force for Cologne.* |

**What the answers cover, honestly.** Live traffic is the motorways. Closures
and roadworks also cover federal roads, Land roads in Niedersachsen, Sachsen and
Thüringen, and the traffic reports some Länder and cities publish (Baden-Württemberg,
Schleswig-Holstein, Berlin, Köln, Hannover); other city streets are not covered.
Places and addresses come from OpenStreetMap, so what is not mapped there cannot
be found, and opening hours and ratings are not part of it. A **watch** lives in
the conversation that opened it: the server keeps every change there, and your
assistant shows it when you ask, or on its own if your client supports MCP
notifications. Nothing is sent by e-mail or SMS. Up to 10 watches per
conversation, each for up to 24 hours (3 by default), and a road is watched as a
whole, not one section of it.

## 💬 Real answers

These came back from the production server at `https://mcp.viafrei.de/mcp`
(server 1.8.18) on **2026-10-06, 23:00 Berlin time**. They are not mock-ups. Each
one shows the first lines of what the tool returned, and the source line exactly
as it was sent, shortened where marked.

<details open>
<summary><b>🚆 "Welche Züge fahren als Nächstes ab Hamburg Hbf?"</b> — <code>get_train_departures</code></summary>

```text
Abfahrten ab Hamburg Hbf (nächste 60 Minuten):
23:00 S S5 → Hamburg Elbgaustraße, ab Hamburg Hbf (S-Bahn), Gleis 2, pünktlich
23:00 S S7 → Hamburg-Altona(S), ab Hamburg Hbf (S-Bahn), Gleis 1, pünktlich
23:02 S S5 → Hamburg-Neugraben, ab Hamburg Hbf (S-Bahn), Gleis 4, pünktlich
23:06 RE RE5 → Cuxhaven, ab Hamburg Hbf, Gleis 14A-C, pünktlich

Stand 22:59 · Quelle: Fahrplandaten: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet (https://developers.deutschebahn.com; …) · …
```
Platform, delay and the estimated real departure, in one line each.
*Edited: six of ten departures omitted. The board listed the first two S-Bahn rows twice; that is a known defect being fixed, and the repeats are among the omitted rows.*
</details>

<details>
<summary><b>♿ "Funktioniert der Aufzug am Bahnhof Köln Messe/Deutz?"</b> — <code>check_station_facilities</code></summary>

```text
In Köln Messe/Deutz ist 1 von 10 gemeldeten Anlagen außer Betrieb.
Fahrtreppe zu Gleis 4/5: außer Betrieb
Aufzug Aufzug Gl. 12 KVB Tunnel: in Betrieb
Aufzug zu Gleis 11: in Betrieb
…
Stadtbahn Köln Bf Deutz/Messe LANXESS arena (Störungsliste Stand 22:59): 1 von 17 gemeldeten Anlagen ist außer Betrieb. …
Fahrtreppe 60 - HÜ 083 (Bf. Deutz/Messe): außer Betrieb, gemeldet seit 17:32
```
The railway station and the Stadtbahn stop below it, from two operators, in one
answer. For anyone with a wheelchair, a pram or a heavy suitcase, this is the
difference between a station being usable and not.
*Edited: most facilities of both lists omitted, and the source lines cut.*
</details>

<details>
<summary><b>⚡ "Where can I charge with Type 2 near Leipzig?"</b> — <code>find_charging_station</code></summary>

```text
Charging around Leipzig (within 10 km, Type 2), nearest first:
1. Parkhaus Neumarkt, Neumarkt 30, 04109 Leipzig (Parkhaus Neumarkt) — 0.2 km, Type 2, up to 22 kW, no status data, per charging point register
2. Motel One Leipzig Nikolaikirche, Schuhmachergäßchen 5, 04109 Leipzig (Wirelane GmbH) — 0.3 km, Type 2, up to 11 kW, no status data, per charging point register
…
Only a few operators publish live occupancy; "no status data" means unknown, not free.
Charging point register as of 2026-09-01 — chargers as reported by their operators to the Bundesnetzagentur, with no live occupancy and no warranty of accuracy or completeness.

As of 23:00 · Source: Ladesäulenregister: Bundesnetzagentur.de, CC BY 4.0, bearbeitet (…) · …
```
It says what it does not know: "no status data" is unknown, never free.
*Edited: entries 3–5 omitted, a municipality key removed from the heading, and the sources cut to `…`.*
</details>

<details>
<summary><b>🚦 "Is public transport in North Rhine-Westphalia running on time?"</b> — <code>check_transit_disruption</code></summary>

```text
North Rhine-Westphalia: 8% of observed trips more than 5 minutes late (324 of 4,088 trips
in the last 60 minutes, from 60,858 reports at 18,923 stops), 90 trips with cancelled stops.
…
Trend: about the same as the 60 minutes before (9%).
…
Published service alerts for North Rhine-Westphalia, in force now (1):
- Line 515: Straßensperrung Liebigstraße / Haltestellenentfall (valid 2026-05-18 to 2026-11-12)

As of 22:58 · Source: Echtzeitdaten: DELFI e.V. via Mobilithek, CC BY-SA, bearbeitet (…) · …
```
Region-wide, with the method stated, and the operators' own service alerts
beside the figure. The share-alike condition arrives as part of the answer,
because it is part of the data.
*Edited: the method paragraphs between the figure and the alerts omitted, and the sources cut to `…`.*
</details>

<details>
<summary><b>📍 "What is at 52.5163, 13.3777?"</b> — <code>describe_location</code></summary>

```text
Description of 52.5163, 13.3777:
- Nearest address: Pariser Platz 1, 10117 Berlin (3 m)
- Settlement: Unter den Linden (0.7 km)
- District: Berlin (1.9 km)
- Administrative area: Berlin (2.3 km)
- Junction: AS Sachsendamm (A100) (5.0 km)

Address data as of 2026-10-04
As of 23:00 · Source: Ortsdaten: © GeoNames (CC BY 4.0), bearbeitet (…) · … · OSM-Standortdaten: © OpenStreetMap-Mitwirkende, ODbL 1.0 (https://www.openstreetmap.org/copyright; …)
```
That's the Brandenburg Gate. *Edited: two of four sources cut to `…`.*
</details>

<details>
<summary><b>🇩🇪 "Do I need an emission sticker for Stuttgart?"</b> — <code>get_driving_rules</code></summary>

```text
Low-emission zone Stuttgart: yes, you need the green Feinstaubplakette.
• Stuttgart: Zone covering the entire city area — it starts at the city boundary, not at the centre.
  Required: the green plaque (emission group 4). …
  [to verify: Stuttgart's additional diesel restrictions have changed repeatedly; check the city's current position]
  (Umweltbundesamt, Umweltzonen in Deutschland)
…
```
Every statement carries its source, and says *[to verify]* where we could not
confirm it. *Edited: most points omitted.*
</details>

<details>
<summary><b>🅿️ "Find lorry parking on the A9"</b> — <code>find_parking</code></summary>

```text
Parking along the A9:
1. Aster Moos O — Lorry parking (Lkw-Parkplatz), 14 lorry spaces, no occupancy published
2. Baarer Weiher O — Lorry parking (Lkw-Parkplatz), 45 lorry spaces, no occupancy published
…
As of 23:00 · Source: Verkehrsdaten: Autobahn GmbH des Bundes (https://verkehr.autobahn.de)
Where no "free" count is shown the operator publishes no occupancy — it does not mean the site is full.
```
*Edited: three of five sites omitted.*
</details>

**Why the source line matters.** Every answer ends with one, and it is the
licence speaking: show it to whoever reads the answer. Copy the line the server
sends you, not the ones on this page, which are shortened. See
[Using the data you get back](#-using-the-data-you-get-back).

## 🔌 Connect in one minute

The product is a **hosted MCP server**. Point your client at it and the tools
appear. There is nothing to install, no key to request and no quota to
negotiate. Step-by-step guides for each assistant:
**[viafrei.de/en/connect](https://viafrei.de/en/connect)**.

**Claude Code**
```bash
claude mcp add --transport http viafrei https://mcp.viafrei.de/mcp
```

**Claude (desktop app and claude.ai), ChatGPT and other apps that take a connector URL** —
add a custom connector with this address (in Claude: Settings → Connectors → *Add custom connector*;
in ChatGPT the connector settings need developer mode):
```
https://mcp.viafrei.de/mcp
```

**Cursor, and any client with an `mcpServers` file that takes a `url`**, over HTTP:
```json
{ "mcpServers": { "viafrei": { "url": "https://mcp.viafrei.de/mcp" } } }
```

**VS Code** (`.vscode/mcp.json`, or *MCP: Add Server* from the command palette):
```json
{ "servers": { "viafrei": { "type": "http", "url": "https://mcp.viafrei.de/mcp" } } }
```

**Clients that speak only stdio** — for example Claude Desktop's config file
(`claude_desktop_config.json`, opened from Settings → Developer → *Edit Config*).
That is what this package is for:
```json
{ "mcpServers": { "viafrei": { "command": "npx", "args": ["-y", "viafrei"] } } }
```
Node 22 or newer. `npx` fetches the bridge when your client starts it. If the
file already has an `mcpServers` block, add the `"viafrei"` entry inside it
rather than pasting a second block.

**An older client on HTTP+SSE** is answered too, at `https://mcp.viafrei.de/sse`.
The transport is deprecated in the specification, so prefer the address above
when you can:
```bash
claude mcp add --transport sse viafrei https://mcp.viafrei.de/sse
```

Restart the client and ask one of the questions above.

### Where to find ViaFrei

- **npm — [`viafrei`](https://www.npmjs.com/package/viafrei).** This package:
  the stdio bridge, for the config line above. Its page shows the current
  version and this README.
- **Smithery — [smithery.ai/servers/viafrei/viafrei](https://smithery.ai/servers/viafrei/viafrei).**
  Connect through Smithery's hosted connection, with no local install.
- **Glama — [glama.ai/mcp/servers/mavrovde/viafrei-mcp](https://glama.ai/mcp/servers/mavrovde/viafrei-mcp).**
  The directory listing for this repository, with the tool list.
- **Official MCP Registry — `de.viafrei/mcp`.** The hosted endpoint, as MCP
  clients and directories that read the [registry](https://registry.modelcontextprotocol.io)
  find it; [`server.json`](server.json) is the entry. It is the registry's own record,
  republished by hand when the listing changes, so its version may differ from this package's.
- **For AI tools — [viafrei.de/llms.txt](https://viafrei.de/llms.txt)** and
  [llms-full.txt](https://viafrei.de/llms-full.txt): what ViaFrei is, how to
  connect, and every tool in one line each.

## 🧰 Everything it can do

<!-- catalogue:begin — generated by scripts/gen-readme-catalogue.mjs from catalogue.json; do not edit by hand -->

**21 tools, 9 prompts, 10 resources and 2 resource templates** — server 1.8.29, snapshot of 2026-10-07. Each line is the server's own words; the full parameters are in [API.md](API.md).

#### 🚗 On the road

| tool | what it answers |
|---|---|
| [`check_autobahn_traffic`](API.md#check_autobahn_traffic--autobahn-traffic) — Autobahn traffic | Jams, slow traffic, closures and roadworks in force this minute on up to 5 motorways, with delay/speed. |
| [`check_road_status`](API.md#check_road_status--road-status-and-closures) — Road status and closures | Whether a motorway, B road or Land road (NI, SN, TH) is open, closed or restricted, now and in coming days; by place, jams and city/Land messages near a town. |
| [`find_roadworks_ahead`](API.md#find_roadworks_ahead--planned-roadworks) — Planned roadworks | Returns roadworks PLANNED on one German motorway, or one Bundes- or Landesstraße in Niedersachsen, Sachsen or Thüringen, in a date window: section, restriction, start and end. |
| [`find_parking`](API.md#find_parking--parking-nearby) — Parking nearby | Returns parking near a place, a coordinate or along one motorway: rest areas with lorry spaces, car parks and P+R sites, with total spaces and, where published, free spaces now and the reading's age. |

#### 🚆 Public transport

| tool | what it answers |
|---|---|
| [`get_train_departures`](API.md#get_train_departures--train-departures) — Train departures | Next departures from a German railway station, with platform, delay, cancellations. |
| [`get_departures`](API.md#get_departures--scheduled-departures-bus-tram-train) — Scheduled departures (bus, tram, train) | Scheduled departures from any German stop — bus, tram, U-Bahn, S-Bahn, train, ferry — with line, destination, platform. |
| [`check_transit_disruption`](API.md#check_transit_disruption--public-transport-disruption-in-a-region) — Public-transport disruption in a region | How punctual public transport is now in one German region: the share of trips ever over 5 min late, trips with a cancelled stop, the trend, and the service alerts in force there (diversions, closed stops). |
| [`check_station_facilities`](API.md#check_station_facilities--station-lifts-and-escalators) — Station lifts and escalators | Report whether the lifts and escalators of a German railway station — or of a Köln Stadtbahn stop — are working now: each one, where it is, its state (in service / out of service / unknown) and the operator's explanation. |

#### ⚡ Charging and fuel

| tool | what it answers |
|---|---|
| [`find_charging_station`](API.md#find_charging_station--ev-charging-nearby) — EV charging nearby | Returns EV charging sites near a place or coordinate with operator, connector types, maximum power, price per kWh where published, and how many points are free right now where the operator publishes live status. |
| [`find_cheapest_fuel`](API.md#find_cheapest_fuel--cheapest-fuel-nearby) — Cheapest fuel nearby | Returns the cheapest stations for one fuel grade near a place or coordinate: price per litre, brand, address, distance, open state. |
| [`find_fuel_station`](API.md#find_fuel_station--find-a-filling-station) — Find a filling station | Finds filling stations around a place or coordinate under any combination of filters — grade, brand, name, open now, open at a time you name, open 24 h — sorted by distance, price or name. |

#### 📍 Places and addresses

| tool | what it answers |
|---|---|
| [`find_place`](API.md#find_place--look-up-a-place) — Look up a place | Looks up a place name and returns every place that matches, each with its kind, official key (AGS/RS), population, English name and coordinate. |
| [`find_poi`](API.md#find_poi--find-a-named-place) — Find a named place | Finds a named business or landmark — company, shop, clinic, hotel — and returns its address, category and coordinate. |
| [`find_address`](API.md#find_address--look-up-a-street-address) — Look up a street address | Looks up a street address and returns its coordinate, plus what OpenStreetMap holds under it. |
| [`describe_location`](API.md#describe_location--describe-a-coordinate) — Describe a coordinate | Turns a coordinate into words: the nearest address, settlement, Kreis, administrative area and motorway junction, each with its own distance. |
| [`find_nearby`](API.md#find_nearby--what-is-nearby) — What is nearby | Overview of what is around a place or coordinate: nearby fuel stations, EV charging, parking, the nearest railway station and motorway junction, each with its distance. |

#### 🚲 Sharing

| tool | what it answers |
|---|---|
| [`find_sharing`](API.md#find_sharing--shared-bikes-nearby) — Shared bikes nearby | Returns rentable shared bikes near a place or coordinate: bike-sharing stations with bikes and free docks now, and free-floating bikes around, with distance and data age (nextbike incl. KVB Rad, MyRadl, VAG_Rad; Donkey Republic). |

#### 🌦️ Weather and rules

| tool | what it answers |
|---|---|
| [`check_weather_warnings`](API.md#check_weather_warnings--official-weather-warnings) — Official weather warnings | Returns the official DWD weather warnings in force for a place or coordinate — storm, snow, ice, heavy rain, thunderstorm, heat — with the DWD's own Warnstufe 1–4, the area, the local validity window and the official text unaltered. |
| [`get_driving_rules`](API.md#get_driving_rules--german-driving-rules) — German driving rules | Returns the German road rules a visitor needs: low-emission zones (Umweltzone) and which Feinstaubplakette a city requires, speed limits (advisory 130), winter tyres, alcohol, the Sunday lorry ban, tolls (no car toll), Rettungsgasse, what must be in the car, and electric cars (E-Kennzeichen, ad-hoc payment, plugs). |

#### 🔔 Watches

| tool | what it answers |
|---|---|
| [`watch_situation`](API.md#watch_situation--watch-for-a-change) — Watch for a change | Opens a watch so THIS conversation is told when something changes: a road reopening, a stop running late, a weather warning starting, a charge point turning free. |
| [`stop_watch`](API.md#stop_watch--stop-a-watch) — Stop a watch | Ends a watch this conversation opened with watch_situation, so no further notifications arrive for it. |

#### 🧭 Prompts — ready-made briefings

Pick one in your client's prompt menu and fill in the blanks; it calls the right tools in the right order.

| prompt | what it does |
|---|---|
| `plan_departure` — Trip briefing before departure — Reise-Briefing vor der Abfahrt | Briefs a drive that is about to start: the official weather warnings at both ends, whether each motorway is open, and the jams in force this minute, ending in one go/no-go sentence. |
| `compare_travel_options` — Drive or take the train? — Auto oder Bahn? | Weighs one trip by car against the same trip by rail: closures and live jams on the motorway side, the next departures and the region's punctuality on the rail side, as two paragraphs the traveller can compare. |
| `prepare_car_trip` — What you need before driving in Germany — Vorbereitung der Autofahrt | Collects what a driver must carry and know before driving in Germany and into one particular city: the low-emission-zone badge, speed limits, winter tyres, the alcohol limit, tolls, mandatory equipment and the rules for an electric car. |
| `plan_fuel_stop` — Refuel or charge on the way — Tank- oder Ladestopp unterwegs | Finds where this traveller fills up or charges on the way: the cheapest stations for one fuel grade around one place, or the charging points with the right connector and power, and the rest area beside them if they also need a break. |
| `plan_commute` — Plan today's commute by train — Pendelfahrt für heute planen | Plans one public-transport leg on the day itself: the next departures from the station with delays, platforms and cancellations, and whether the region's buses and trains are running normally at this hour. |
| `plan_arrival_parking` — Where to leave the car on arrival — Parken am Ziel | Finds where to leave the car at the end of the drive: the car park in town, the park-and-ride at the edge with the onward departures, or the rest area if the traveller is early. |
| `find_a_place` — Find out what a name refers to — Herausfinden, was ein Name meint | Resolves a bare name of unknown kind into a place, a named thing, or an address, trying each table in turn and stopping at the first that answers. |
| `plan_local_errand` — What is around this place? — Was ist hier in der Nähe? | Answers "what is around here" for one place: the nearest fuel, EV charging, parking, railway station and motorway junction in one glance, then — only if the traveller wants more than the nearest one — the depth tool for that one category. |
| `explain_this_coordinate` — Say where a coordinate is — Sagen, wo eine Koordinate liegt | Turns a bare lat/lon into a sentence a traveller understands: the nearest address, settlement, Kreis, administrative area and motorway junction, each with its own distance. |

#### 📚 Resources — reference your assistant can read

| resource | what it holds |
|---|---|
| `viafrei://attribution` — Data sources & attribution | Licence and attribution text for every data source ViaFrei uses. |
| `viafrei://coverage` — Coverage | Which feeds, places and vehicles ViaFrei can answer for right now — licence, cadence and freshness per feed, which large cities hold no fuel price yet, plus what is deliberately not covered. |
| `viafrei://rules/driving-in-germany` — Driving in Germany — the rules a visitor needs (DE/EN) | Curated, sourced and dated: low-emission zones, speed, winter tyres, alcohol, tolls, the Sunday lorry ban, equipment, emergencies and electric driving. |
| `viafrei://rules/low-emission-zones` — Low-emission zones (Umweltzonen) — city, zone, plaque, where to buy it (DE/EN) | Which German cities run a low-emission zone, which Feinstaubplakette they require and where to buy it. |
| `viafrei://emergency` — Emergency in Germany — 112, 110, rescue lane, breakdown, crash (DE/EN) | What to dial, how to form the Rettungsgasse, what to do in a breakdown or after a crash, and what the law requires you to carry. |
| `viafrei://rules/electric-driving` — Electric driving in Germany — E plate, charging, payment, plugs (DE/EN) | What an electric car needs in Germany: the E-Kennzeichen and why its privileges differ per city, the green plaque, the right to ad-hoc card payment, plug standards, how prices are shown, etiquette and what to do in an emergency. |
| `viafrei://status/feeds` — Feed status | Per feed: is it still arriving? |
| `viafrei://watches` — My watches | The watches THIS conversation has open, with what each one is watching and when it expires. |
| `viafrei://gazetteer` — Gazetteer coverage | What the place index (gazetteer_places) holds: rows and last load per source and kind, how many carry an English name, and the sixteen Länder it can name — the coverage behind find_place/find_poi/find_nearby's place answers. |
| `viafrei://addresses` — Address coverage | What the OSM-derived address table (osm_addresses) holds per Bundesland — the Länder and each one's extract date read from the rows, the row counts estimated from the planner's statistics and labelled so — plus the ODbL § 4.6 offer owed to anyone who receives an address-derived result. |
| `viafrei://watch/{id}` — One watch | One watch of this conversation: what is being watched, what it has reported, and the attribution of the data behind each report. |
| `viafrei://place/{query}` — A resolved place | One place, poi or address resolved the same way every tool resolves `place` — a point, a short list of candidates, or an honest no — so a name can be pinned once and reused as lat/lon. |

<!-- catalogue:end -->

**The running server is the source of truth.** This list and [API.md](API.md)
are rendered from a dated snapshot of it, and CI fails if either drifts from that
snapshot. Ask any MCP client for `tools/list` to see what is live this minute.

### Worked use cases

Walkthroughs that chain several tools, each naming what comes back:

- 🛣️ [Driving Munich to Berlin](https://github.com/mavrovde/viafrei-mcp/wiki/Use-case-Driving-Munich-to-Berlin): several motorways in one call, roadworks ahead, a fuel or charging stop, and parking at the far end.
- 🚉 [The commute that broke](https://github.com/mavrovde/viafrei-mcp/wiki/Use-case-The-commute-that-broke): departures, regional disruption, and a station lift that is out.
- 🔋 [An EV on a long weekend](https://github.com/mavrovde/viafrei-mcp/wiki/Use-case-An-EV-on-a-long-weekend): charging by connector and power, low-emission-zone rules, and what is around a stop.
- 🚚 [Fleet and logistics briefings](https://github.com/mavrovde/viafrei-mcp/wiki/Use-case-Fleet-and-logistics-briefings): a dispatcher's morning brief, and watches that report a change instead of being polled.
- 🗺️ [Building a local guide agent](https://github.com/mavrovde/viafrei-mcp/wiki/Use-case-Building-a-local-guide-agent): a vague place to coordinates and back, and what OpenStreetMap's licence asks of you.

How well it answers, measured: [test rounds](https://github.com/mavrovde/viafrei-mcp/wiki/Test-rounds), 1000 questions in German and English against production, with every finding published.

## 🛠️ For developers

**It's plain MCP over HTTP.** You can call it without an SDK:

```bash
# 1. open a session
curl -si https://mcp.viafrei.de/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"me","version":"0"}}}' \
  | grep -i mcp-session-id

# 1b. tell the server you are ready — the MCP lifecycle requires it before any request
curl -s https://mcp.viafrei.de/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H 'mcp-session-id: <from step 1>' -H 'mcp-protocol-version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# 2. ask a question (put the session id from step 1 in the header)
curl -s https://mcp.viafrei.de/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H 'mcp-session-id: <from step 1>' -H 'mcp-protocol-version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_weather_warnings","arguments":{"place":"Freiburg im Breisgau","language":"en"}}}'
```

- **One endpoint instead of a stack of integrations.** [SOURCES.md](SOURCES.md)
  lists the publishers behind it, among them Autobahn GmbH, Deutsche Bahn, DWD,
  DELFI, the national access point Mobilithek, BKG, GeoNames, OpenStreetMap and
  MTS-K. Each has its own format, release rhythm and licence, and they arrive
  here as one protocol.
- **Results are written to be read aloud.** A tool answers in sentences an
  assistant can pass on, says what it does not know ("no status data means
  unknown, not free"), and ends with the source line.
- **Annotated honestly.** Nineteen of the twenty-one tools are read-only and
  idempotent (`readOnlyHint`, `idempotentHint`), so a client can call them
  without a confirmation prompt. The two watch tools are not, because opening
  or stopping a watch changes what the server will tell you later, and their
  annotations say so.
- **Prompts and resources, not only tools.** Nine ready-made briefings, and a
  reference shelf (driving rules, emission zones, emergency numbers,
  attribution) your assistant can read directly.
- **Watches.** `watch_situation` turns polling into a notification for as long
  as the session lives: a road closure appearing or clearing, a stop's departures
  running late, a region's late share reaching a threshold (a quarter by
  default), a DWD warning coming into force, a charge point turning free. Three
  hours by default, 24 at most, and at most 10 per session. What a watch has
  reported is readable at `viafrei://watches` and `viafrei://watch/{id}`, and a
  client that subscribes to that resource is told when it reports something new.
  It reaches no inbox and no phone.
- **Machine-readable failures**, in the bridge too: one line on stderr and a
  distinct exit code per cause (see below).

### Bridge configuration

| option | what it does |
|---|---|
| `--url <url>` | endpoint to relay to. Default `https://mcp.viafrei.de/mcp`. See the note below |
| `--header "Name: value"` | extra HTTP header on every request, repeatable. For an API key, when there is one |
| `--timeout <ms>` | per-request timeout, default 30000. The event stream is never timed out |
| `--version`, `--help` | print and exit |

Many MCP clients can only pass an `env` block, not arguments, so every option
has an environment variable too:

| variable | same as |
|---|---|
| `VIAFREI_MCP_URL` | `--url` |
| `VIAFREI_MCP_HEADER` | `--header`. Separate several headers with a **newline**, which can never appear in a header name or value. That way nothing you might need to send is unrepresentable: a comma, a semicolon and a space all occur inside real header values |
| `VIAFREI_MCP_TIMEOUT_MS` | `--timeout` |

A flag wins over the variable, and the variable wins over the built-in default.
A `--header` of the same name replaces one from the variable; a `--header` of a
different name is added alongside it.

**There is no self-hosted ViaFrei.** The server is a hosted service. `--url` is
not a way to run your own: it exists for a proxy or gateway in front of the
service, and for the stub server this repository's test suite starts.

### When something is wrong

The bridge prints one line to stderr and exits with a code that says what
happened. No stack traces:

```
viafrei: cannot reach https://example.invalid/mcp: host not found (DNS) (ENOTFOUND) - check your network connection; --url only if you relay through a proxy
```

The same text also goes back to the client as a JSON-RPC error, so an assistant
can say what went wrong instead of going quiet.

| exit | meaning |
|---|---|
| `0` | clean shutdown (the client closed stdin, or sent SIGINT/SIGTERM) |
| `1` | something else went wrong; the line says what |
| `2` | bad usage: a flag or a value the bridge does not accept |
| `3` | the endpoint could not be reached, stopped answering, or never answered in time |
| `4` | the endpoint answered and the bridge cannot continue: it refused (the line names the HTTP status), forgot the session, answered with something that is not MCP, or redirected to another origin |
| `5` | protocol version mismatch; the line names the version the server speaks |

**A slow call may be a retried call.** A `429`, `502`, `503` or `504` is tried
again **once**, after the delay the server asked for in `Retry-After`, or 250 ms
when it asked for none. A connection that fails outright (reset, broken pipe,
socket or connect timeout) is tried once more after 250 ms. Two cases are not
retried, because waiting would be worse than answering: a `429` with no usable
`Retry-After`, and any requested delay longer than your timeout. An event stream
is never retried.

**Your timeout bounds each request, not the whole call.** Two attempts plus a
delay can add up to about **three times** the timeout, and more if the endpoint
redirects. If you need a hard ceiling, enforce it on your side.

An established session may wobble: a dropped event stream is a warning, and the
bridge reconnects. It may not stay dead in silence. Several failures in a row
with nothing succeeding in between end the process with the code above, so the
client that started it finds out.

### What the bridge does not do

- **No tracking.** No telemetry, no analytics, no usage counter, no update check.
- **No stored files or credentials.** It writes no file outside the OS temp
  directory. `--header` is passed through to the endpoint and is never persisted
  or logged.
- **No cross-origin redirects.** A redirect off the origin you pointed it at is
  refused with one line naming both ends, so a server cannot forward your API
  key somewhere you did not choose. Same-origin redirects are followed normally.

## 💼 For businesses

- **The licence work is done, and it travels with the answer.** Each result
  carries the attribution its sources require. Where a source attaches a
  condition, the result states it: share-alike is flagged, and the MTS-K purpose
  limit arrives as a sentence you are meant to show.
- **Built for answering people.** Live figures, sourced and dated, in the
  language of the question. Good for travel and mobility assistants,
  dispatchers' briefings, customer service and step-free station checks.
- **Read the business page:** [viafrei.de/en/business](https://viafrei.de/en/business).
  It covers six use cases and how to work with us.

## ⚖️ Using the data you get back

Every result carries an attribution line. **Show it to the person reading the
answer.** The full register is at the resource `viafrei://attribution`, and
**[SOURCES.md](SOURCES.md)** is the readable version: every publisher, what it
covers, its licence, and the exact line to reproduce.

Two constraints matter more than the rest, because getting them wrong is a
licence breach rather than a style problem:

- **MTS-K fuel prices are consumer information only.** Any other use is
  unlawful in any form, raw, reformatted or aggregated, and never for the fuel
  industry or its IT providers. On top of that we ask for no redistribution at
  all: answer the person who asked; do not build a product out of it. (This is
  also why this page shows no fuel price.)
- **DELFI's realtime and disruption feeds are Creative Commons
  Attribution-ShareAlike** (its static timetable and stop directory are CC BY 4.0,
  and so is VBB's Berlin-Brandenburg feed). Share-alike travels with anything you
  *derive* from it: recompute it, reshape it, rearrange it or build a delay table
  out of it, and that is Adapted Material you must license under BY-SA (art. 1(a)
  names material "translated, altered, arranged, transformed, or otherwise
  modified"). Merely **showing** it beside another source's data is an
  aggregation and puts no obligation on the other source. The realtime feeds'
  catalogue records name no licence version, so do not rely on one for a
  derivative; [SOURCES.md](SOURCES.md) has the detail, and also covers the two
  share-alike databases under the ODbL (OpenStreetMap and one lorry-park operator).

See also [NOTICE](NOTICE) and [LICENSE](LICENSE).

## 🗣️ Tell us when an answer is wrong

ViaFrei is live, free, and still growing. Some sources are thinner than they will
be, and a tool can be slow or wrong. **A tool that fails is something the server
sees. A tool that answers confidently with the wrong thing is not.** Use the
[*A tool answered badly, or not at all*](https://github.com/mavrovde/viafrei-mcp/issues/new?template=answer.yml)
issue template, saying what you asked and what came back. That report is the
one thing we cannot get any other way.

## The server itself

The MCP server is a **hosted service**, and its source is closed. It is not in
this repository and is not published. What is public is the part meant to be:
the tool names, descriptions, input schemas, result shapes and attribution
lines, which is everything a client reads from `tools/list`. We say this plainly
so nobody spends an evening looking for the server code.

## Contributing · Security · Licence

- **Contributing:** yes, please. See [CONTRIBUTING.md](https://github.com/mavrovde/viafrei-mcp/blob/main/CONTRIBUTING.md)
  and [CODE_OF_CONDUCT.md](https://github.com/mavrovde/viafrei-mcp/blob/main/CODE_OF_CONDUCT.md).
  The bridge is small and self-contained, which makes it a good place for a first patch.
- **Security:** never open a public issue for a key, a token or anything that
  looks like one. [SECURITY.md](https://github.com/mavrovde/viafrei-mcp/blob/main/SECURITY.md)
  has the private reporting path.
- **Licence:** [Apache-2.0](LICENSE) for this code. Data obtained through the
  server keeps its provider's licence; see [NOTICE](NOTICE).

<div align="center">

**[viafrei.de](https://viafrei.de/en)** — Deutsch · English · Русский · Български · Українська · Română · Türkçe

</div>
