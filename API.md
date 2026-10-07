# API reference

**This file is generated. Do not edit it by hand.**

It is a rendering of what the production ViaFrei MCP server answered when it
was asked to describe itself — `initialize`, `tools/list`, `resources/list`,
`resources/templates/list` and `prompts/list`. Every tool description below is
the server's own text, reproduced verbatim, because that text is what an
assistant reads when it decides which tool to call; paraphrasing it here would
document a different server.

**It is a dated snapshot, taken on 2026-10-07.** Generating this file makes
it impossible for the document and the snapshot to disagree — CI regenerates and
compares — but it cannot keep the snapshot from ageing against the live server,
because a capture is a point in time. **The source of truth is the running
server:** connect any MCP client and call `tools/list`.

| | |
| --- | --- |
| Server | `viafrei` 1.8.26 |
| MCP protocol | `2025-06-18` |
| Streamable HTTP | https://mcp.viafrei.de/mcp |
| Legacy HTTP+SSE | https://mcp.viafrei.de/sse |
| Captured from | `https://mcp.viafrei.de/mcp` on 2026-10-07 |
| Surface | 21 tools, 10 resources, 2 resource templates, 9 prompts |
| Parameter schemas | JSON Schema draft-07 |
| Capabilities | `tools`, `resources`, `prompts`, `logging` |

No API key. No account. No sign-up.

## Contents

- [How to read a result](#how-to-read-a-result)
- [Tools](#tools) — 21
- [Resources](#resources) — 10
- [Resource templates](#resource-templates) — 2
- [Prompts](#prompts) — 9

## How to read a result

Every tool returns MCP content blocks. The text block is written to be read
aloud to a person; structured detail travels in `_meta`.

Three things are conditions of use rather than presentation, and they are the
same for every tool here:

1. **Show the attribution line a result carries.** It is a licence condition of
   the data, not a credit you may drop for brevity.
2. **If a result carries `_meta.purposeNote`, reproduce that sentence verbatim.**
   It states a limit the publisher places on what the data may be used for.
3. **Do not redistribute what the licence does not allow you to.** Fuel prices in
   particular are consumer information only. The per-source terms, and the two
   conditions that are licence breaches rather than style problems, are in
   [SOURCES.md](SOURCES.md).

Times are Europe/Berlin. Every tool takes a `language` parameter; set it to the
language the person is writing in rather than relying on the default.

The server's own instructions to a connecting client, verbatim:

> ViaFrei answers from German open transport data, live: motorway traffic, closures and roadworks (plus Land and city traffic messages where a feed carries them), fuel prices, EV charging, parking, train and public-transport departures, regional public-transport punctuality and service alerts, station lifts and escalators, DWD weather warnings, places and addresses, and the curated German driving rules. Always show the attribution line of a result to the user, and when a result carries `_meta.purposeNote` or `_meta.conditionNote`, show that sentence verbatim as well — it is a legal condition of the data, not a caption. Times are Europe/Berlin; the rules answers carry a review date and are informational, not legal advice. ViaFrei is in beta: sources are still being added and answers and coverage can change, so when a decision depends on a closure, a departure or a price, tell the user to confirm it with the source the attribution line names.

## Tools

### `check_autobahn_traffic` — Autobahn traffic

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Jams, slow traffic, closures and roadworks in force this minute on up to 5 motorways, with delay/speed. Use when asked about a named motorway now: Stau, a delay, how it looks, or reported closures; name every motorway (Munich→Berlin: A9). Do NOT use for whether a road is open or passable — check_road_status at any clock — nor a closure with no time word or a later one (tonight, the weekend); Baustellen dated or geplant — find_roadworks_ahead; Stau in a town, no motorway named — check_road_status; fuel (find_cheapest_fuel), trains (get_train_departures). ~5 min old. Show the attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `roads` | array of string | **yes** | — | min 1 item(s); max 5 item(s); each item: pattern `^[Aa] ?\d{1,3}$` |
| `cursor` | string | no | — | max length 256 |
| `kinds` | array of string | no | `["warning","closure","roadworks"]` | min 1 item(s); each item: one of `"warning"`, `"roadworks"`, `"closure"` |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `limit` | integer | no | `10` | min 1; max 50 |

- **`roads`** — Autobahn numbers, e.g. ["A9"] or ["A8", "A99", "A9"] (1–5 per call). Name every motorway on the route so the whole drive is briefed in one call — "A9", "A 9" and "a9" are the same road. Results are grouped per road, in the order you list them.
- **`cursor`** — Pagination cursor from a previous result's _meta.nextCursor. Omit for the first page.
- **`kinds`** — Which event kinds to return: warning = live traffic (jams, slow traffic, hazards), closure = full closures, roadworks = construction sites. Set it when the SUBJECT of the question is one of those categories by name: "Baustellen auf der A8?" is ["roadworks"], "welche Sperrungen sind in diesem Moment gemeldet?" is ["closure"]. Omit it when the question is how the road IS — Stau, frei, a delay, "wie sieht es aus", "everything"; the German "Stau?" is the idiom for the whole picture, and a filter nobody asked for hides the closure on the same stretch. Whether a closure question is this tool's at all is decided by two things, and the noun (Sperrung, Vollsperrung, closure) is neither. FIRST THE CLOCK: only a question about this minute (jetzt, gerade, in diesem Moment, right now, at this very minute) can be this tool's — with no time word at all, or for a later window (tonight, heute Abend, am Wochenende, the coming days), it is check_road_status. SECOND, WHAT IS ASKED, which the clock cannot see: what is REPORTED or in force on a named motorway is this tool ("ist auf der A5 in diesem Moment eine Vollsperrung gemeldet?", "which closures are in force on the A100 at this very minute?"), while whether the road is OPEN or passable is check_road_status AT ANY CLOCK — "ist die A8 offen", "ist die A3 in diesem Moment gesperrt?", "komme ich da durch?" — and so is a closure asked around a town instead of on a motorway number. Baustellen with a date or the word geplant are find_roadworks_ahead. Default: all three.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`limit`** — Maximum events to return across all roads (1–50, default 10). Jams on every road come first, then closures and roadworks; roads keep the order you listed them within each. Only what is in force now is listed — closures announced for later are counted apart in the headline.

### `find_cheapest_fuel` — Cheapest fuel nearby

**Read-only** — it changes nothing. Reaches a third-party source (open world). Idempotent: true. Destructive: false.

> Returns the cheapest stations for one fuel grade near a place or coordinate: price per litre, brand, address, distance, open state. Use when the user asks where to fill up or what fuel costs. Do NOT use for charging an electric car (call find_charging_station), price history, or traffic (call check_autobahn_traffic). Radius ≤ 25 km, at most 10 stations. For a brand, a name, open now or at a named time, or nearest-first, call find_fuel_station. Each line names the age of its price and opening-hours claim. Prices are consumer information only; the attribution line and MTS-K note must be shown.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `fuel` | string | no | `"e10"` | one of `"e5"`, `"e10"`, `"diesel"` |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `limit` | integer | no | `5` | min 1; max 10 |
| `lon` | number | no | — | min -180; max 180 |
| `place` | string | no | — | min length 1; max length 120 |
| `radius_km` | number | no | `5` | min 1; max 25 |

- **`fuel`** — Fuel grade: "e5" (Super E5), "e10" (Super E10, the standard German petrol) or "diesel". Default "e10". Pass the grade the person named — a diesel driver is not helped by a petrol price.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude in WGS 84, e.g. 48.137. Use with lon when the caller already holds coordinates; otherwise use place.
- **`limit`** — How many stations to return, cheapest first (1–10, default 5). The provider's terms cap it at 10.
- **`lon`** — Longitude in WGS 84, e.g. 11.576. Use with lat; otherwise use place.
- **`place`** — Where to look, as free text: a city ("München", "Munich"), a district or Kreis ("Kreis Fulda"), a Bundesland, a station or stop ("Hamburg Hbf"), a motorway junction ("AK Neufahrn"), or a street address with a house number ("Bahnhofstraße 12, 36037 Fulda"). A motorway number alone ("A7") resolves to the road, which has no single point — name a town or junction on it instead. Use this instead of coordinates whenever the person named a place. An address needs its town or postcode — a street and a number alone exist in many towns. Give either place OR lat+lon, never both.
- **`radius_km`** — Search radius around the place in kilometres (1–25, default 5). The provider's terms cap it at 25 km — a larger circle is a dataset request, not a consumer question.

### `find_fuel_station` — Find a filling station

**Read-only** — it changes nothing. Reaches a third-party source (open world). Idempotent: true. Destructive: false.

> Finds filling stations around a place or coordinate under any combination of filters — grade, brand, name, open now, open at a time you name, open 24 h — sorted by distance, price or name. Use when the question is WHICH station: the closest diesel to a stop, an ARAL open tonight, what one forecourt sells. Do NOT use for the plain "where is fuel cheapest" question (call find_cheapest_fuel) or for charging an electric car (call find_charging_station). Every result carries the attribution and the MTS-K note, and says how old each price and opening-hours claim is.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `brand` | string | no | — | min length 1; max length 60 |
| `fuel` | string | no | — | one of `"e5"`, `"e10"`, `"diesel"` |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `limit` | integer | no | `5` | min 1; max 10 |
| `lon` | number | no | — | min -180; max 180 |
| `name` | string | no | — | min length 1; max length 120 |
| `open_at` | string | no | — | pattern `^(?:\d{1,2}:\d{2}\|\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2})$` |
| `open_now` | boolean | no | `false` | — |
| `place` | string | no | — | min length 1; max length 120 |
| `radius_km` | number | no | `5` | min 1; max 25 |
| `sort` | string | no | `"distance"` | one of `"distance"`, `"price"`, `"name"` |
| `whole_day` | boolean | no | `false` | — |

- **`brand`** — Only stations of this brand, matched case-insensitively anywhere in the brand field: "ARAL", "Shell", "TotalEnergies", "JET". Use it when the person named a chain ("die ARAL an der B1"). Free stations often carry no brand at all and are then not matched by any brand.
- **`fuel`** — Only stations with a current price for this grade: "e5" (Super E5), "e10" (Super E10) or "diesel". Omit to get every station near the place whatever it sells — the answer then lists all the grades it holds a price for. Required when sort is "price", because a price ordering needs a grade.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude in WGS 84, e.g. 48.137. Use with lon when the caller already holds coordinates; otherwise use place.
- **`limit`** — How many stations to return (1–10, default 5).
- **`lon`** — Longitude in WGS 84, e.g. 11.576. Use with lat; otherwise use place.
- **`name`** — Part of the station's own name or brand, case-insensitive: "Autohof", "Raststätte Fulda". Use it when the person named a specific forecourt rather than a chain. Combine with place to keep the search local.
- **`open_at`** — Only stations open at that time in Germany (Europe/Berlin): "23:30" means the next time the clock shows 23:30, and "2026-09-30 06:15" a specific local date and time. Use it for "is it still open tonight". Do not pass it together with open_now — they ask the same question about two different clocks.
- **`open_now`** — When true, only stations the published opening hours say are open at this moment. Default false. A station whose hours we have never read is NOT returned by this filter and is counted in the answer instead — the result never guesses that an unknown station is open.
- **`place`** — Where to look, as free text: a city ("München", "Munich"), a district or Kreis ("Kreis Fulda"), a Bundesland, a station or stop ("Hamburg Hbf"), a motorway junction ("AK Neufahrn"), or a street address with a house number ("Bahnhofstraße 12, 36037 Fulda"). A motorway number alone ("A7") resolves to the road, which has no single point — name a town or junction on it instead. Use this instead of coordinates whenever the person named a place. An address needs its town or postcode — a street and a number alone exist in many towns. Give either place OR lat+lon, never both.
- **`radius_km`** — Search radius around the place in kilometres (1–25, default 5). 25 km is the provider's own ceiling — a larger circle is a dataset request, not a consumer question.
- **`sort`** — Order of the answer: "distance" (nearest first, the default — use it for "closest diesel to Hamburg Hbf"), "price" (cheapest first, needs fuel), or "name" (alphabetical, for a person scanning a list of a brand's forecourts).
- **`whole_day`** — When true, only stations the provider flags as open around the clock (24/7). Default false. Use it for a night drive; it is a stricter filter than open_now, which is satisfied by a station that closes at 22:00.

### `find_parking` — Parking nearby

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Returns parking near a place, a coordinate or along one motorway: rest areas with lorry spaces, car parks and P+R sites, with total spaces and, where published, free spaces now and the reading's age. Use when asked where to park or leave the car for the train ("Parkhaus in Köln", "Rastplatz A3", "P+R"). Do NOT use for fuel (find_cheapest_fuel) or EV charging (find_charging_station). Radius ≤ 25 km, ≤ 10 sites per list; ODbL and CC BY-SA sources are separate lists (up to three). No "free now" means no published count, not full. No prices: for "was kostet" say so. Show each source's attribution.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `kind` | string | no | `"any"` | one of `"any"`, `"rest_area"`, `"car_park"`, `"park_and_ride"`, `"truck"` |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `limit` | integer | no | `5` | min 1; max 10 |
| `lon` | number | no | — | min -180; max 180 |
| `only_with_free_spaces` | boolean | no | `false` | — |
| `place` | string | no | — | min length 1; max length 120 |
| `radius_km` | number | no | `10` | min 1; max 25 |
| `road` | string | no | — | max length 16 |

- **`kind`** — Which kind of parking: "rest_area" = motorway rest and service area (no feed we ingest classifies this category at all, so an answer filtered to it says so and names the parking we do hold), "car_park" = public car park (Parkhaus/Parkplatz), "park_and_ride" = P+R beside a station, "truck" = lorry parking, "any" = all of them. Default "any". Pass a kind only when the person named one — "Rastanlage"/"Raststätte" is "rest_area", a lorry driver asking for a break wants "truck", someone leaving the car for the train wants "park_and_ride". A camper, a caravan or a coach is none of the five: leave the argument out rather than filtering a tourist into lorry bays.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude in WGS 84, e.g. 48.137. Use with lon when the caller already holds coordinates; otherwise use place.
- **`limit`** — How many facilities to return, nearest first (1–10, default 5).
- **`lon`** — Longitude in WGS 84, e.g. 11.576. Use with lat; otherwise use place.
- **`only_with_free_spaces`** — Set true ONLY when the person insists on somewhere with free spaces right now. It keeps just the facilities whose operator publishes live occupancy AND currently reports a space, and the result says how many were dropped for publishing nothing — most German parking publishes no occupancy at all, so true usually narrows the answer to very little. Default false.
- **`place`** — Where to look, as free text: a city ("München", "Munich"), a district or Kreis ("Kreis Fulda"), a Bundesland, a station or stop ("Hamburg Hbf"), a motorway junction ("AK Neufahrn"), or a street address with a house number ("Bahnhofstraße 12, 36037 Fulda"). A motorway number alone ("A7") resolves to the road, which has no single point — name a town or junction on it instead. Use this instead of coordinates whenever the person named a place. An address needs its town or postcode — a street and a number alone exist in many towns. Give either place OR lat+lon, never both.
- **`radius_km`** — Search radius around place or lat+lon in kilometres (1–25, default 10). Ignored when you pass road, which covers the whole motorway. Start small in a city and widen if the answer is empty.
- **`road`** — A single motorway number to list parking along, e.g. "A3" ("A 3" and "a3" are the same road). Use this when the person named a road and no town — "Rastplatz auf der A7". Give road OR place OR lat+lon, never two of them: a road is a 900 km line and a place is a point, so the two answer different questions. When the question names BOTH — "Parkhaus in Köln an der A3" — use the place: a person parks at a point, and the radius already covers the motorway beside it.

### `check_road_status` — Road status and closures

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Whether a motorway, B road or Land road (NI, SN, TH) is open, closed or restricted, now and in coming days; by place, jams and city/Land messages near a town. Use when asked if a road is open/passable — "ist die A8 in diesem Moment gesperrt", "komme ich durch", at any clock, closures tonight/weekend — or Stau in a city: "Stau in Köln?". Do NOT use for jams/delays on a named motorway or a multi-motorway route — check_autobahn_traffic; roadworks in a date window — find_roadworks_ahead; city street: not held, say so. One road or place per call, ≤ 14 days, ≤ 11 entries. Show the attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `horizon_days` | integer | no | `3` | min 0; max 14 |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `limit` | integer | no | `10` | min 1; max 11 |
| `lon` | number | no | — | min -180; max 180 |
| `place` | string | no | — | min length 1; max length 120 |
| `road` | string | no | — | pattern `^(?:[ABab] ?\d{1,3}\|[LlSs] ?\d{1,4})$` |

- **`horizon_days`** — How many days ahead to look, counting from now (0 = right now only, max 14, default 3). Set it only to what the person actually asked for: 0 when they said right now / gerade / jetzt / in diesem Moment, 1 for tonight or heute Abend, 3 for "this weekend", 7 for "next week", and for a named weekday ("am Freitag", "on Friday") the number of days from today to that day. A bare "is the A8 open?" asks for no window — omit the argument and take the default rather than reading it as 0. Live closures are always included whatever this is, and so, by place, are the jams reported right now ("Stau in Köln?" needs no horizon).
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude in WGS 84, e.g. 48.137. Use with lon when the caller already holds coordinates; otherwise use place.
- **`limit`** — Maximum entries to return (1–11, default 10). By road, closures come first, then restrictions in force, then planned works; by place, nearest first.
- **`lon`** — Longitude in WGS 84, e.g. 11.576. Use with lat; otherwise use place.
- **`place`** — Where to look, as free text: a city ("München", "Munich"), a district or Kreis ("Kreis Fulda"), a Bundesland, a station or stop ("Hamburg Hbf"), a motorway junction ("AK Neufahrn"), or a street address with a house number ("Bahnhofstraße 12, 36037 Fulda"). A motorway number alone ("A7") resolves to the road, which has no single point — name a town or junction on it instead. Use this instead of coordinates whenever the person named a place. An address needs its town or postcode — a street and a number alone exist in many towns. Give either place OR lat+lon, never both.
- **`road`** — One German motorway or federal road, e.g. "A8" or "B27", or a Landes- or Staatsstraße in Niedersachsen, Sachsen or Thüringen, e.g. "L1025" or "S296". "A8", "A 8" and "a8" are the same road. Use this whenever the person named a road — it is the only input that reaches the planned-works data, which is filed by road and section and carries no coordinates. When the person also says WHERE — a town or a Bundesland ("die B2 bei Potsdam", "L1025 in Niedersachsen") — pass that as place too: only sources for that Land answer, and a Land no source covers is named. L and S numbers repeat in every Land, so give the Land with them. Otherwise give exactly one of road, place, or lat+lon.

### `find_roadworks_ahead` — Planned roadworks

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Returns roadworks PLANNED on one German motorway, or one Bundes- or Landesstraße in Niedersachsen, Sachsen or Thüringen, in a date window: section, restriction, start and end. Use when a date or window is named, the question says geplant, or how long a site lasts ("Baustellen auf der A7 in den Sommerferien?"). ONE road per call. Do NOT use when more than one motorway is named, for the situation this minute, or for Baustellen with neither date nor geplant — all three are check_autobahn_traffic; whether a road is open — call check_road_status. ≤ 92 days, max 20 sites. Show the attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `road` | string | **yes** | — | pattern `^(?:[AaBb] ?\d{1,3}\|[LlSs] ?\d{1,4})$` |
| `from` | string | no | — | pattern `^\d{4}-\d{2}-\d{2}$` |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `limit` | integer | no | `10` | min 1; max 20 |
| `to` | string | no | — | pattern `^\d{4}-\d{2}-\d{2}$` |

- **`road`** — The road to look at, one per call: an Autobahn, e.g. "A7" or "A100", or a Bundesstraße, Landesstraße or Staatsstraße in Niedersachsen, Sachsen or Thüringen, e.g. "B6", "L1025", "S296" — "A7", "A 7" and "a7" are the same road. B and L roads in other Länder, Kreisstraßen and city streets are not covered. Ask again for a second road.
- **`from`** — First day of the window, as YYYY-MM-DD in German local time. Omit for today. Resolve relative wording ("next Friday", "in den Sommerferien", "nächsten Monat") into real dates yourself, counted from today's date; this argument never takes words, and it never takes a fixed example date — the window a person means moves with the calendar.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`limit`** — Maximum sites to return (1–20, default 10), ordered by planned start. Every returned site is in the structured result; the readable text prints the first 10 and says how many more of them are in the structured half. The answer always names how many sites the window holds in total, so a small limit never hides the size of the problem.
- **`to`** — Last day of the window, inclusive, as YYYY-MM-DD. Omit for 7 days after `from`, which is the right window for "am I going to hit roadworks on this drive". The window may span at most 92 days. For "how long will this last" / "wie lange dauert die Baustelle noch", leave both dates out: the default 7 days already returns the site's planned end date. Only widen — 28 days is the sensible step — when the person asked about a period that long.

### `find_charging_station` — EV charging nearby

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Returns EV charging sites near a place or coordinate with operator, connector types, maximum power, price per kWh where published, and how many points are free right now where the operator publishes live status. Use when an EV driver asks where to charge ("Wo kann ich laden?", "CCS 150 kW near Leipzig", "ist gerade eine Säule frei?"). Do NOT use for petrol or diesel — call find_cheapest_fuel; for E-Kennzeichen or Ladekarte rules — call get_driving_rules. Radius ≤ 25 km, ≤ 10 sites; availability is missing for most operators and is then unknown, never free. Show the attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `connector` | string | no | — | one of `"ccs2"`, `"type2"`, `"chademo"` |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `limit` | integer | no | `5` | min 1; max 10 |
| `lon` | number | no | — | min -180; max 180 |
| `min_power_kw` | number | no | — | min 1; max 1000 |
| `only_available` | boolean | no | `false` | — |
| `place` | string | no | — | min length 1; max length 120 |
| `radius_km` | number | no | `10` | min 1; max 25 |

- **`connector`** — Plug the car needs: "ccs2" (CCS Combo 2 — the DC fast-charging standard on almost every European EV), "type2" (Typ 2 / Mennekes, the AC socket) or "chademo" (older Japanese DC, e.g. Nissan Leaf). Omit unless the person named their plug or their car model — filtering on a guess hides chargers they could have used.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude in WGS 84, e.g. 48.137. Use with lon when the caller already holds coordinates; otherwise use place.
- **`limit`** — How many charging sites to return, nearest first (1–10, default 5).
- **`lon`** — Longitude in WGS 84, e.g. 11.576. Use with lat; otherwise use place.
- **`min_power_kw`** — Only charging points of at least this many kW (1–1000). Use when the person asks for fast charging or names a number: 50 = DC fast, 150 = HPC, 300 = the fastest posts in Germany. Omit for "where can I charge" — 11 kW overnight is a valid answer to that question.
- **`only_available`** — When true, return only sites with at least one point reported FREE right now. Default false. Use it when the person asks what is free at this moment. Note that only some operators publish live status: the result always says how many nearby sites were dropped because their status is unknown, so the filter never silently hides a charger that may well be free.
- **`place`** — Where to look, as free text: a city ("München", "Munich"), a district or Kreis ("Kreis Fulda"), a Bundesland, a station or stop ("Hamburg Hbf"), a motorway junction ("AK Neufahrn"), or a street address with a house number ("Bahnhofstraße 12, 36037 Fulda"). A motorway number alone ("A7") resolves to the road, which has no single point — name a town or junction on it instead. Use this instead of coordinates whenever the person named a place. An address needs its town or postcode — a street and a number alone exist in many towns. Give either place OR lat+lon, never both.
- **`radius_km`** — Search radius around the place in kilometres (1–25, default 10). A charging stop is worth a detour, so this is wider than the fuel radius — but 25 km is the cap, and a larger circle is a dataset request rather than a driver's question.

### `find_place` — Look up a place

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Looks up a place name and returns every place that matches, each with its kind, official key (AGS/RS), population, English name and coordinate. Use when the person asks where somewhere is, when you need a coordinate for another tool, and above all to RECOVER after a tool reported a name as ambiguous — this is where you find out which Neustadt is which. Pass `near` to rank and separate same-named places by distance. Do NOT use to find a company, shop or landmark: call find_poi. At most 10 results, radius <= 200 km. Every result carries an attribution line that must be shown to the user.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `query` | string | **yes** | — | min length 2; max length 120 |
| `kind` | string | no | — | one of `"city"`, `"district"`, `"admin"`, `"station"`, `"stop"`, `"motorway"`, `"junction"` |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `limit` | integer | no | `5` | min 1; max 10 |
| `lon` | number | no | — | min -180; max 180 |
| `near` | string | no | — | max length 120 |
| `radius_km` | number | no | — | min 1; max 200 |

- **`query`** — The place name to look up, as the person said it — "Neustadt", "Munich", "Kreis Fulda", "Köln Hbf". English names and spellings without umlauts both work.
- **`kind`** — Narrow to one kind: "city", "district" (Kreis), "admin" (Land or Regierungsbezirk), "station", "stop", "motorway" or "junction". Omit unless the person was specific.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude to measure from, instead of `near`.
- **`limit`** — How many candidates to return, best match first (1–10, default 5).
- **`lon`** — Longitude to measure from, instead of `near`.
- **`near`** — A second place to measure from, used to tell same-named candidates apart: "Neustadt" near "Hamburg" is one of twenty Neustadts. Every result then carries its distance from this point.
- **`radius_km`** — When near/lat+lon is given, keep only candidates within this many kilometres (1–200). Omit to rank by distance without dropping any.

### `find_poi` — Find a named place

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Finds a named business or landmark — company, shop, clinic, hotel — and returns its address, category and coordinate. Use when the person names a THING rather than a town: "the adesso office in Dortmund", "the nearest Aldi". The coordinate it returns passes to any other tool as lat/lon. Do NOT use for a town, district or station (every tool's `place` resolves those), nor for fuel, charging or parking, which have their own tools. Give "in" (a town) when you can: far faster than searching nationwide. At most 10 results, radius <= 50 km. OpenStreetMap under ODbL 1.0; show the attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `name` | string | **yes** | — | min length 2; max length 120 |
| `category` | string | no | — | one of `"office"`, `"amenity"`, `"shop"`, `"tourism"`, `"healthcare"`, `"leisure"`, `"industrial"`, `"historic"`, `"natural"`, `"building"` |
| `in` | string | no | — | max length 120 |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `limit` | integer | no | `5` | min 1; max 10 |
| `lon` | number | no | — | min -180; max 180 |
| `near` | string | no | — | max length 120 |
| `radius_km` | number | no | `10` | min 1; max 50 |

- **`name`** — The name of the thing to find — a company, shop, clinic, hotel, office or landmark. Part of the name is enough: "adesso" finds "adesso SE". A chain name works too, because brands are matched as well as names.
- **`category`** — Narrow to one OpenStreetMap family: "office" (companies, agencies), "shop", "amenity" (fuel, pharmacy, school, restaurant, town hall), "healthcare", "tourism" (hotels, attractions), "leisure", "industrial", "historic" (castles, monuments, city gates), "natural" (mountain peaks) or "building". Omit unless the person was specific.
- **`in`** — A town to search in — "Dortmund", "Fulda". Strongly preferred: it is both far faster and far less ambiguous than a nationwide search. Use this OR near/lat+lon, not both.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude of the point to search around, when the caller already holds a coordinate.
- **`limit`** — How many to return, best match first (1–10, default 5).
- **`lon`** — Longitude of the point to search around.
- **`near`** — A place to search around, when the question is "the nearest X" rather than "X in Y". Use with radius_km.
- **`radius_km`** — Search radius in kilometres around near/lat+lon (1–50, default 10). Ignored when "in" is used.

### `find_address` — Look up a street address

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Looks up a street address and returns its coordinate, plus what OpenStreetMap holds under it. Use when the person gives a STREET AND NUMBER — "Bahnhofstraße 12, Fulda" — for the point, or to see what is mapped there. The coordinate passes to any other tool as lat/lon. Do NOT use for a town/district/station name alone (find_place) or a company/shop/landmark by name (find_poi) — needs a street and a number. At most 5 results; more than one in ONE town means the door is mapped twice, and results in several towns are a question to ask the person. OpenStreetMap ODbL 1.0; show the attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `query` | string | **yes** | — | min length 3; max length 160 |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `limit` | integer | no | `3` | min 1; max 5 |

- **`query`** — A street address, as a person writes one: street and house number, plus a town or postcode — "Bahnhofstraße 12, 36037 Fulda" or "Bahnhofstraße 12, Fulda". Both orders work. A street and number with neither a town nor a postcode cannot be placed (the same street name exists in about two thousand German towns) and is refused.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`limit`** — How many results to return (1–5, default 3) — more than one means the same address carries more than one OpenStreetMap object.

### `describe_location` — Describe a coordinate

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Turns a coordinate into words: the nearest address, settlement, Kreis, administrative area and motorway junction, each with its own distance. Use when you already HAVE a lat/lon and need to say where that is. Do NOT use to look up a place or address BY NAME — that is find_place, find_poi or find_address; this only goes coordinate to words. The gazetteer facts are the NEAREST point, not a boundary lookup — near a border it can differ, and the admin point can be a Regierungsbezirk, not a Land. OpenStreetMap ODbL 1.0 for the address; show the attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `lat` | number | **yes** | — | min -90; max 90 |
| `lon` | number | **yes** | — | min -180; max 180 |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |

- **`lat`** — Latitude of the point to describe (WGS84).
- **`lon`** — Longitude of the point to describe (WGS84).
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.

### `find_nearby` — What is nearby

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Overview of what is around a place or coordinate: nearby fuel stations, EV charging, parking, the nearest railway station and motorway junction, each with its distance. Use when someone asks "what is around me" or "what is near <place>" — a broad look, not one category in depth. Do NOT use for a fuel grade's price (find_cheapest_fuel), charger/connector status (find_charging_station), parking kind/occupancy (find_parking), a NAME lookup (find_place/find_poi/find_address), or a coordinate's address (describe_location). Radius ≤ 15 km, up to 3 per category. Shows each source's attribution.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `categories` | array of string | no | — | min 1 item(s); each item: one of `"fuel"`, `"charging"`, `"parking"`, `"station"`, `"junction"` |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `lon` | number | no | — | min -180; max 180 |
| `place` | string | no | — | min length 1; max length 120 |
| `radius_km` | number | no | `5` | min 1; max 15 |

- **`categories`** — Which categories to include: "fuel", "charging", "parking", "station" (railway station), "junction" (motorway junction). Omit for all five. Pass a subset only when the person named one — otherwise the full picture is the point of this tool.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude in WGS 84, e.g. 48.137. Use with lon when the caller already holds coordinates; otherwise use place.
- **`lon`** — Longitude in WGS 84, e.g. 11.576. Use with lat; otherwise use place.
- **`place`** — Where to look, as free text: a city ("München", "Munich"), a district or Kreis ("Kreis Fulda"), a Bundesland, a station or stop ("Hamburg Hbf"), a motorway junction ("AK Neufahrn"), or a street address with a house number ("Bahnhofstraße 12, 36037 Fulda"). A motorway number alone ("A7") resolves to the road, which has no single point — name a town or junction on it instead. Use this instead of coordinates whenever the person named a place. An address needs its town or postcode — a street and a number alone exist in many towns. Give either place OR lat+lon, never both.
- **`radius_km`** — Search radius around place or lat+lon in kilometres (1–15, default 5). This tool answers "what is around me", not "search a wide area" — for that, use the specific tool with its own wider radius.

### `find_sharing` — Shared bikes nearby

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Returns rentable shared bikes near a place or coordinate: bike-sharing stations with bikes and free docks now, and free-floating bikes around, with distance and data age (nextbike incl. KVB Rad, MyRadl, VAG_Rad; Donkey Republic). Use when someone asks for a rental or shared bike ("Leihrad", "Fahrradverleih", "nächstes nextbike", "bike share near me"). Do NOT use for parking (find_parking) or a general look around a place (find_nearby). Radius ≤ 5 km, ≤ 20 stations; e-scooters are not covered. Shows each source's attribution.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `limit` | integer | no | `8` | min 1; max 20 |
| `lon` | number | no | — | min -180; max 180 |
| `only_available` | boolean | no | `true` | — |
| `place` | string | no | — | min length 1; max length 120 |
| `radius_km` | number | no | `1` | min 0.1; max 5 |

- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude in WGS 84, e.g. 48.137. Use with lon when the caller already holds coordinates; otherwise use place.
- **`limit`** — How many stations to list, nearest first (1–20, default 8). Free-floating bikes are summarised, not listed one by one.
- **`lon`** — Longitude in WGS 84, e.g. 11.576. Use with lat; otherwise use place.
- **`only_available`** — true (default): list only stations with at least one bike to rent right now. false: also list empty stations, e.g. to find a free dock to return a bike.
- **`place`** — Where to look, as free text: a city ("München", "Munich"), a district or Kreis ("Kreis Fulda"), a Bundesland, a station or stop ("Hamburg Hbf"), a motorway junction ("AK Neufahrn"), or a street address with a house number ("Bahnhofstraße 12, 36037 Fulda"). A motorway number alone ("A7") resolves to the road, which has no single point — name a town or junction on it instead. Use this instead of coordinates whenever the person named a place. An address needs its town or postcode — a street and a number alone exist in many towns. Give either place OR lat+lon, never both.
- **`radius_km`** — Search radius around place or lat+lon in kilometres (0.1–5, default 1). Example: 1

### `get_driving_rules` — German driving rules

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Returns the German road rules a visitor needs: low-emission zones (Umweltzone) and which Feinstaubplakette a city requires, speed limits (advisory 130), winter tyres, alcohol, the Sunday lorry ban, tolls (no car toll), Rettungsgasse, what must be in the car, and electric cars (E-Kennzeichen, ad-hoc payment, plugs). Use when someone drives through Germany or asks whether they may enter a city. Do NOT use for live traffic or closures: check_autobahn_traffic; to FIND a charger: find_charging_station. Optional city narrows to its zone. Sourced and dated; show the attribution. Not legal advice.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `city` | string | no | — | min length 2; max length 60 |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `topic` | string | no | — | one of `"lez"`, `"speed"`, `"winter"`, `"alcohol"`, `"toll"`, `"truck_ban"`, `"equipment"`, `"emergency"`, `"ev"` |

- **`city`** — City the question is about, e.g. "Stuttgart", "München", "Munich". Narrows "lez" to that city's zone and adds the per-city caveat for "ev". Other topics are nationwide. Omit when the question is not about one city.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`topic`** — Which rule to answer. "lez" = low-emission zone and Feinstaubplakette, "speed" = speed limits including the Autobahn advisory 130, "winter" = winter-tyre duty, "alcohol" = alcohol and drugs, "toll" = car and lorry toll, "truck_ban" = Sunday and holiday lorry ban, "equipment" = what the law requires in the car, "emergency" = 112/110, rescue lane, breakdown, crash, "ev" = electric car (E-Kennzeichen, charging payment, plugs). Omit for a one-line overview of all nine.

### `check_transit_disruption` — Public-transport disruption in a region

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Returns how punctual public transport is right now in one German region: the share of distinct trips at least once more than 5 minutes late, trips with a cancelled stop, the trend, and the published service alerts in force there (diversions, closed stops, by line). Use when the user asks whether buses and trains are running normally, or whether a strike, storm or works disrupt local transport. Do NOT use for one trip or station's departures (use get_train_departures); delay figures are not per line. Window ≤ 120 min. CC BY-SA (DELFI) or CC BY 4.0 (VBB, Berlin/Brandenburg): show attribution.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `lon` | number | no | — | min -180; max 180 |
| `region` | string | no | — | min length 1; max length 120 |
| `window_min` | integer | no | `60` | min 5; max 120 |

- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude in WGS 84, e.g. 48.137. Use with lon when the caller already holds coordinates; otherwise use region.
- **`lon`** — Longitude in WGS 84, e.g. 11.576. Use with lat; otherwise use region.
- **`region`** — The German region to report on, as free text: a Bundesland ("Bayern", "Bavaria", "Nordrhein-Westfalen"), a city ("Hamburg", "Köln"), a Kreis ("Landkreis Fulda") or one of the conurbations Ruhrgebiet, Rhein-Ruhr and Rhein-Main. A town inside a Kreis is reported as that Kreis and the answer says so, because the data is filed at Kreis level. Not a stop, not a street, not an address. Give either region OR lat+lon, never both.
- **`window_min`** — How many minutes back to look, 5–120 (default 60). The trend compares this window with the equally long one before it, so 60 means "the last hour against the hour before". Use a short window for "right now" and a long one for "has it been bad all morning".

### `check_weather_warnings` — Official weather warnings

**Read-only** — it changes nothing. Reaches a third-party source (open world). Idempotent: true. Destructive: false.

> Returns the official DWD weather warnings in force for a place or coordinate — storm, snow, ice, heavy rain, thunderstorm, heat — with the DWD's own Warnstufe 1–4, the area, the local validity window and the official text unaltered. Use when someone asks about weather for a trip, whether it is safe to drive somewhere, or about storm, snow or ice warnings. Do NOT use for a plain forecast (not offered: warnings only) or for closures and jams (call check_autobahn_traffic). Says so when the data is not current instead of reporting an all-clear. Show the result's attribution line to the user.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `lat` | number | no | — | min -90; max 90 |
| `lon` | number | no | — | min -180; max 180 |
| `min_level` | integer | no | `0` | min 0; max 4 |
| `place` | string | no | — | min length 1; max length 120 |

- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`lat`** — Latitude in WGS 84, e.g. 48.137. Use with lon when the caller already holds coordinates; otherwise use place.
- **`lon`** — Longitude in WGS 84, e.g. 11.576. Use with lat; otherwise use place.
- **`min_level`** — Lowest official DWD level to report, 0–4 (default 0, i.e. everything). The DWD's own names: 1 = Wetterwarnung, 2 = Markante Wetterwarnung, 3 = Unwetterwarnung, 4 = Warnung vor extremem Unwetter; 0 = Vorabinformation Unwetter, an advance notice that is not yet a Warnstufe. Raise it ONLY when the question names a level or a Warnstufe in so many words ("ab Stufe 3", "level 3 or higher", "nur Stufe 4"). Unwetter, Unwetterwarnung, severe and storm are the ordinary way to ask about bad weather, not a filter: leave it at 0 there — a level the caller filtered away is a warning the person is never told about.
- **`place`** — Where to look, as free text: a city ("München", "Munich"), a district or Kreis ("Kreis Fulda"), a Bundesland, a station or stop ("Hamburg Hbf"), a motorway junction ("AK Neufahrn"), or a street address with a house number ("Bahnhofstraße 12, 36037 Fulda"). A motorway number alone ("A7") resolves to the road, which has no single point — name a town or junction on it instead. Use this instead of coordinates whenever the person named a place. An address needs its town or postcode — a street and a number alone exist in many towns. Give either place OR lat+lon, never both.

### `get_train_departures` — Train departures

**Read-only** — it changes nothing. Reaches a third-party source (open world). Idempotent: true. Destructive: false.

> Next departures from a German railway station, with platform, delay and cancellations. Use when asked when a train, S-Bahn or ICE leaves a named station, or whether THAT departure is late; vague later-today wording ("heute Abend") stays here. Whether ONE line is punctual ("ist die S1 pünktlich?") is NOT this tool, though it is rail and about delay — call check_transit_disruption. Do NOT use for buses, trams, a non-railway stop, another day or a time over 2 h away — get_departures. No destination filter: read the board. Max 15 departures, window 120 min. Results carry their attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `duration_min` | integer | no | `60` | min 5; max 120 |
| `eva_no` | string | no | — | pattern `^\d{6,8}$` |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `limit` | integer | no | `10` | min 1; max 15 |
| `station` | string | no | — | min length 1; max length 120 |
| `when` | string | no | — | format `date-time`; pattern (288 characters — see the description; the `format` above is the short answer) |

- **`duration_min`** — How far ahead to look, in minutes (5–120, default 60). Use a small window for "what leaves now" and a larger one for "this evening". Above 120 is refused: a departure board is not a timetable search.
- **`eva_no`** — The station's EVA number (6–8 digits, e.g. 8002549 for Hamburg Hbf), when a previous result gave you one. It skips the name lookup and is exact — use it to answer a follow-up about a station this tool has already named.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`limit`** — How many departures to return, earliest first (1–15, default 10). More than 15 is refused — that is a board a person can read, not a dataset.
- **`station`** — The railway station, as the person says it: "Hamburg Hbf", "Köln Hbf", "Munich Central", "Frankfurt (Main) Hbf". Pass their words — English names and "central station" are understood. If the name fits several stations (a bare "Hauptbahnhof"), call anyway: the result lists them and asks which; do not guess one yourself. Give either station OR eva_no, never both.
- **`when`** — Start of the window as an ISO-8601 instant with an offset ("2026-09-20T18:30:00+02:00"). Leave it out for "now", which is what almost every question means. Times in the answer are Europe/Berlin whatever you pass.

### `get_departures` — Scheduled departures (bus, tram, train)

**Read-only** — it changes nothing. Answers from data this service already holds (closed world). Idempotent: true. Destructive: false.

> Scheduled departures from any German stop — bus, tram, U-Bahn, S-Bahn, train, ferry — with line, destination, platform. Use when asked when a bus, tram, U-Bahn or ferry goes, or for another DAY or a clock time over 2 h away: "Wann fährt der nächste Bus ab Fulda Bahnhof?" Do NOT use for a railway station's trains now or later today — get_train_departures. Planned times only: for "is my bus late?" give the plan and say so; regional punctuality check_transit_disruption. No A-to-B journeys: say so, no call. Holds ≥ 48 h ahead, ≤ 3 days; further out, say so. 15 per call. Show the attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `duration_min` | integer | no | `60` | min 5; max 1440 |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `limit` | integer | no | `10` | min 1; max 15 |
| `modes` | array of string | no | — | min 1 item(s); each item: one of `"rail"`, `"subway"`, `"tram"`, `"bus"`, `"ferry"` |
| `stop` | string | no | — | min length 2; max length 120 |
| `stop_id` | string | no | — | min length 3; max length 64 |
| `when` | string | no | — | format `date-time`; pattern (288 characters — see the description; the `format` above is the short answer) |

- **`duration_min`** — How far past that moment to look, in minutes (5–1440, default 60). Small for "what goes now", a few hours for an evening. To look further ahead (the timetable reaches at least 48 h), move `when` instead of widening this: a window of a whole day returns at most 15 rows and would answer about the wrong half of it.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`limit`** — How many departures to return, earliest first (1–15, default 10). The result always says how many more were in the window.
- **`modes`** — Keep only these kinds of service: "bus", "tram", "subway" (U-Bahn), "rail" (every train, including S-Bahn and regional) or "ferry". Omit it unless the person named a kind — "nur Busse", "welche Tram". Several are allowed, which is what "die Busse und Bahnen vor dem Hbf" means. An S-Bahn is "rail": the feed does not always distinguish it, and the line name ("S 6") says which it is.
- **`stop`** — The stop, as the person says it: "Fulda, Bahnhof", "München, Marienplatz", "Köln, Hbf", "Hamburg, Rathausmarkt" (town first). Include the town when the person did — half the names in Germany exist in twenty towns, and a bare "Bahnhof" or "Hauptbahnhof" comes back as a list of candidates to choose from, so call it and let the result ask. Pass their words; do not guess an id. Give either stop OR the stop id, never both.
- **`stop_id`** — The stop's timetable id, exactly as a previous result of this tool gave it ("de:06631:1234"). It skips the name lookup and is exact — use it for a follow-up about a stop this tool has already named, and for one the person picked out of a candidate list.
- **`when`** — Start of the window as an ISO-8601 instant with an offset ("2026-10-02T07:30:00+02:00"). Leave it out for "now". Convert the person's words yourself — "morgen früh", "tonight" — and pass the instant; the answer is always rendered in Europe/Berlin.

### `check_station_facilities` — Station lifts and escalators

**Read-only** — it changes nothing. Reaches a third-party source (open world). Idempotent: true. Destructive: false.

> Report whether the lifts and escalators of a German railway station — or of a Köln Stadtbahn stop — are working now: each one, where it is, its state (in service / out of service / unknown) and the operator's explanation. Use when asked about step-free access or a broken lift: "Funktioniert der Aufzug am Kölner Hauptbahnhof?", "is the lift at Hamburg Hbf working?", "Rolltreppe am Neumarkt kaputt?", wheelchair, pram, heavy luggage. Do NOT use for train times, platforms or delays — call get_train_departures. At most 50 facilities, out-of-service ones first. Results carry their attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `eva_no` | string | no | — | pattern `^\d{6,8}$` |
| `facility` | string | no | `"any"` | one of `"any"`, `"elevator"`, `"escalator"` |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `limit` | integer | no | `20` | min 1; max 50 |
| `station` | string | no | — | min length 1; max length 120 |

- **`eva_no`** — The station's EVA number (6–8 digits, e.g. 8000207 for Köln Hbf), when a previous result — a departure board, for instance — already gave you one. It skips the name lookup and is exact.
- **`facility`** — Which equipment to report: "elevator" for lifts only, "escalator" for escalators only, "any" for both (default). Pass a value only when the person named the equipment itself ("Aufzug", "Rolltreppe", "lift", "escalator"): a question about a wheelchair, a pram, heavy luggage or step-free access keeps the default — an escalator carries a suitcase too, and a filter there hides half of what the traveller needs. Filtering does not change how a broken one is reported, only which ones are listed.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`limit`** — How many facilities to list (1–50, default 20). Out-of-service equipment is listed first and the counts in the summary always cover ALL of them, so a shorter list never hides a broken lift.
- **`station`** — The railway station — or Köln Stadtbahn stop — as the person says it: "Köln Hbf", "Hamburg Hbf", "Munich Central", "Neumarkt Köln". Pass their words — English names and "central station" are understood. If the name fits several stations the result lists them and asks which; do not guess one yourself. Give either station OR eva_no, never both.

### `watch_situation` — Watch for a change

**Not read-only** — it creates or removes state. Answers from data this service already holds (closed world). Idempotent: false. Destructive: false.

> Opens a watch so THIS conversation is told when something changes: a road reopening, a stop running late, a weather warning starting, a charge point turning free. Use when the person asks to be told later: "sag mir Bescheid, wenn die A8 wieder frei ist", "tell me when a charger is free". Do NOT use to look something up now (call check_road_status, check_autobahn_traffic or find_charging_station), and do NOT use when an e-mail, SMS or any alert outside this chat was asked for — we cannot send one; say so. Session-scoped. At most 10 watches, 24 h each. Results carry their attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `key` | string | **yes** | — | min length 1; max length 200 |
| `kind` | string | **yes** | — | one of `"road"`, `"station"`, `"region"`, `"place"`, `"weather"`, `"charger"` |
| `condition` | object | no | — | keys: `delay_min`, `late_share`, `min_trips`, `radius_km`, `min_level`, `event`, `point_id` (each described below) |
| `hours` | number | no | — | min 0.25; max 24 |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `until` | string | no | — | format `date-time`; pattern (288 characters — see the description; the `format` above is the short answer) |

- **`key`** — The thing being watched, in the vocabulary of `kind`: a road number, a stop DHID, an AGS prefix, a place name, a DWD warncell, a charging site id. For `road` and `place` it is the person's own words — "A8", "B27", "Fulda" — and needs no lookup. For `station`, `region`, `weather` and `charger` it is an identifier the matching read tool returned — look it up first: `station` = one of `stop.stopIds` from get_departures ("de:14612:28"); an EVA number from get_train_departures ("8000207") is NOT a stop id and is refused, as is any id no known stop carries; `region` from check_transit_disruption, `weather` from check_weather_warnings, `charger` from find_charging_station — a key nothing matches there produces a watch that is simply never triggered.
- **`kind`** — What kind of thing to watch. `road` = one motorway or federal road (key: "A8", "B27") — reports a closure or restriction appearing or clearing; `station` = one public-transport stop by its DHID (key: "de:14612:28") — reports departures running late past the threshold; `region` = a city or district by AGS prefix (key: "14612") — reports the share of late trips crossing the threshold; `place` = a town or address (key: "Fulda") — reports road restrictions appearing within the radius; `weather` = a DWD warncell (key: "105315000") — reports an official warning coming into force; `charger` = one charging site (key: the site id from find_charging_station) — reports a point turning free.
- **`condition`** — Optional threshold. Each key belongs to ONE kind and a key that does not belong to the chosen kind is refused by name; leave it out to use that kind's default.
  - `delay_min` (integer, min 1; max 600) — station: minutes of delay that count as a disruption (default 10).
  - `late_share` (number, min 0.01; max 1) — region: share of observed trips running late that trips the watch (default 0.25).
  - `min_trips` (integer, min 1; max 10000) — region: below this many observed trips the share is noise (default 10).
  - `radius_km` (number, min 0.1; max 200) — place: how far around the place to look (default 25).
  - `min_level` (integer, min 0; max 4) — weather: lowest DWD warning level worth reporting (default 2).
  - `event` (string, one of `"reopen"`, `"any"`) — road: 'reopen' reports only a restriction clearing; 'any' reports both (default).
  - `point_id` (string, min length 1; max length 200) — charger: one charge point of the site instead of any of them.
- **`hours`** — How long to watch, in hours (default 3, maximum 24). Prefer this over `until`: it needs no knowledge of the current time. Give one of `hours` or `until`, never both.
- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`until`** — An explicit end instant as ISO-8601 with an offset ("2026-09-20T18:40:00+02:00"), at most 24 hours ahead. Use only when the person named a time; otherwise use `hours`. Give one of `hours` or `until`, never both.

### `stop_watch` — Stop a watch

**Not read-only** — it creates or removes state. Answers from data this service already holds (closed world). Idempotent: false. Destructive: false.

> Ends a watch this conversation opened with watch_situation, so no further change notifications arrive for it. Use when the person no longer needs to be told — "du musst mir nichts mehr zur A8 sagen", "stop watching that charger". When they name the subject and not an id, take the id from viafrei://watches. Do NOT use to look a situation up (call check_road_status), to list what is running (read viafrei://watches), or to cancel anything outside this chat — there is nothing subscribed elsewhere. A watch id from another session is not found, never stopped. Results carry their attribution line.

| parameter | type | required | default | constraints |
| --- | --- | --- | --- | --- |
| `language` | string | no | `"de"` | one of `"de"`, `"en"` |
| `uri` | string | no | — | max length 64 |
| `watch_id` | integer | no | — | min 1; max 9007199254740991 |

- **`language`** — Set this on every call to the language the person is writing in: "en" if they wrote English, "de" if they wrote German. Do not leave it out because it has a default — the default is only the fallback when the language is genuinely unclear, and an English question answered in German is a wrong answer. Place names, station names and road numbers are never translated in either language; in English the German term is kept in parentheses so the person recognises it on signs and in local apps.
- **`uri`** — The watch's resource uri, e.g. "viafrei://watch/12". Give either this or `watch_id`, not both.
- **`watch_id`** — The numeric id of the watch to stop, as `watch_situation` returned it (the 12 in viafrei://watch/12).

## Resources

| URI | name | type |
| --- | --- | --- |
| `viafrei://attribution` | attribution | `text/plain` |
| `viafrei://coverage` | coverage | `application/json` |
| `viafrei://rules/driving-in-germany` | rules-driving-in-germany | `text/markdown` |
| `viafrei://rules/low-emission-zones` | rules-low-emission-zones | `text/markdown` |
| `viafrei://emergency` | emergency | `text/markdown` |
| `viafrei://rules/electric-driving` | rules-electric-driving | `text/markdown` |
| `viafrei://status/feeds` | feed-status | `application/json` |
| `viafrei://watches` | watches | `application/json` |
| `viafrei://gazetteer` | gazetteer | `application/json` |
| `viafrei://addresses` | addresses | `application/json` |

- **`viafrei://attribution`** — Licence and attribution text for every data source ViaFrei uses.
- **`viafrei://coverage`** — Which feeds, places and vehicles ViaFrei can answer for right now — licence, cadence and freshness per feed, which large cities hold no fuel price yet, plus what is deliberately not covered. Generated from the feed catalogue.
- **`viafrei://rules/driving-in-germany`** — Curated, sourced and dated: low-emission zones, speed, winter tyres, alcohol, tolls, the Sunday lorry ban, equipment, emergencies and electric driving. German and English in one document.
- **`viafrei://rules/low-emission-zones`** — Which German cities run a low-emission zone, which Feinstaubplakette they require and where to buy it. Düsseldorf is named but excluded: its zone data is under a closed licence.
- **`viafrei://emergency`** — What to dial, how to form the Rettungsgasse, what to do in a breakdown or after a crash, and what the law requires you to carry. German and English.
- **`viafrei://rules/electric-driving`** — What an electric car needs in Germany: the E-Kennzeichen and why its privileges differ per city, the green plaque, the right to ad-hoc card payment, plug standards, how prices are shown, etiquette and what to do in an emergency.
- **`viafrei://status/feeds`** — Per feed: is it still arriving? green (a cycle inside the feed's own freshness window), red (stale or errored) or grey (never ran here). Subscribe to be told when a feed changes colour.
- **`viafrei://watches`** — The watches THIS conversation has open, with what each one is watching and when it expires. Session-scoped: another conversation's watches are not listed and cannot be reached.
- **`viafrei://gazetteer`** — What the place index (gazetteer_places) holds: rows and last load per source and kind, how many carry an English name, and the sixteen Länder it can name — the coverage behind find_place/find_poi/find_nearby's place answers.
- **`viafrei://addresses`** — What the OSM-derived address table (osm_addresses) holds per Bundesland — the Länder and each one's extract date read from the rows, the row counts estimated from the planner's statistics and labelled so — plus the ODbL § 4.6 offer owed to anyone who receives an address-derived result.

## Resource templates

| URI template | name | type |
| --- | --- | --- |
| `viafrei://watch/{id}` | watch | `application/json` |
| `viafrei://place/{query}` | place | `application/json` |

- **`viafrei://watch/{id}`** — One watch of this conversation: what is being watched, what it has reported, and the attribution of the data behind each report. Subscribe to be told when it reports something new.
- **`viafrei://place/{query}`** — One place, poi or address resolved the same way every tool resolves `place` — a point, a short list of candidates, or an honest no — so a name can be pinned once and reused as lat/lon.

## Prompts

Prompts are ready-made requests a client can offer as a menu entry. Each one
orchestrates several tools, so it is usually a better starting point than a
single call.

### `plan_departure`

*Trip briefing before departure — Reise-Briefing vor der Abfahrt*

> Briefs a drive that is about to start: the official weather warnings at both ends, whether each motorway is open, and the jams in force this minute, ending in one go/no-go sentence. Use when the traveller asks whether to set off now, how the route looks today, or what is waiting on the A-roads. Do NOT use to weigh car against train — that is compare_travel_options; for a refuelling stop use plan_fuel_stop, for parking on arrival plan_arrival_parking. Show every result's attribution line.

| argument | required | description |
| --- | --- | --- |
| `origin` | **yes** | Where the drive starts, as the traveller wrote it. Example: "München" or "Bahnhofstraße 12, 36037 Fulda". |
| `destination` | **yes** | Where the drive ends, as the traveller wrote it. Example: "Berlin". |
| `roads` | no | The motorways the route uses, comma-separated, at most five. Example: "A9, A4". Leave it out and the recipe names the obvious ones and says so. |
| `departure` | no | When the drive starts, in local words or as an ISO-8601 time with offset. Example: "now", "tomorrow 06:30", "2026-09-21T06:30+02:00". Defaults to now. |
| `language` | no | Set this to the language the traveller is writing in: "en" for English, "de" for German. It decides both the language you answer in and the language argument you pass to every tool call in the recipe. Leave it out only when the language is genuinely unclear — the fallback is German, because the road is German. |

### `compare_travel_options`

*Drive or take the train? — Auto oder Bahn?*

> Weighs one trip by car against the same trip by rail: closures and live jams on the motorway side, the next departures and the region's punctuality on the rail side, as two paragraphs the traveller can compare. Use when the traveller has not decided how to travel. Do NOT use once the decision is made — brief the drive with plan_departure, the rail leg with plan_commute. The punctuality figures keep their own attribution (share-alike unless VBB answered); show every attribution line.

| argument | required | description |
| --- | --- | --- |
| `origin` | **yes** | Where the trip starts, as the traveller wrote it. Example: "Köln". |
| `destination` | **yes** | Where the trip ends, as the traveller wrote it. Example: "Frankfurt". |
| `when` | no | When they want to travel, in local words or as an ISO-8601 time with offset. Example: "this evening". Defaults to now. |
| `roads` | no | The motorways the drive would use, comma-separated, at most five. Example: "A3". Leave it out and the recipe names the obvious ones and says so. |
| `language` | no | Set this to the language the traveller is writing in: "en" for English, "de" for German. It decides both the language you answer in and the language argument you pass to every tool call in the recipe. Leave it out only when the language is genuinely unclear — the fallback is German, because the road is German. |

### `prepare_car_trip`

*What you need before driving in Germany — Vorbereitung der Autofahrt*

> Collects what a driver must carry and know before driving in Germany and into one particular city: the low-emission-zone badge, speed limits, winter tyres, the alcohol limit, tolls, mandatory equipment and the rules for an electric car. Use when the traveller is a visitor, is renting a car, or asks whether a city needs a sticker. Do NOT use for the live road situation — that is plan_departure — or for where to leave the car, which is plan_arrival_parking. Show the attribution and the review date.

| argument | required | description |
| --- | --- | --- |
| `destination_city` | **yes** | The city the driver will actually drive INTO, because the low-emission zone is a city rule. Example: "Stuttgart". |
| `vehicle` | no | What they are driving, when it changes the answer: "electric" adds the charging and badge rules, "lorry" the Sunday driving ban. Defaults to a petrol or diesel car. |
| `topic` | no | One rule topic, if they asked about exactly one — the same nine values get_driving_rules takes. Map what they said: Umweltplakette/Feinstaubplakette/low-emission zone → "lez", Winterreifen → "winter", Tempolimit → "speed", Promillegrenze → "alcohol", Maut → "toll", Sonntagsfahrverbot → "truck_ban", Warnweste/Verbandkasten → "equipment", Rettungsgasse/Panne → "emergency", E-Auto/Laden → "ev". Leave it out for the overview of all nine. |
| `language` | no | Set this to the language the traveller is writing in: "en" for English, "de" for German. It decides both the language you answer in and the language argument you pass to every tool call in the recipe. Leave it out only when the language is genuinely unclear — the fallback is German, because the road is German. |

### `plan_fuel_stop`

*Refuel or charge on the way — Tank- oder Ladestopp unterwegs*

> Finds where this traveller fills up or charges on the way: the cheapest stations for one fuel grade around one place, or the charging points with the right connector and power, and the rest area beside them if they also need a break. Use when the tank or the battery is the question. Do NOT use to brief the whole route — that is plan_departure — and not for parking at the destination, which is plan_arrival_parking. Prices are consumer information for this traveller alone; show every attribution line and any purpose note verbatim.

| argument | required | description |
| --- | --- | --- |
| `place` | **yes** | Where the traveller will be when they need the stop — a town, a junction, a station or a street address with its postcode. One place per call. Example: "Ingolstadt" or "A9 Anschlussstelle Allershausen". |
| `energy` | no | What the vehicle takes. "electric" switches the recipe to charging points; the three fuel grades go to the fuel stations. Set it whenever they named a grade — the fallback is "e10", the standard German petrol and find_cheapest_fuel's own default, and the recipe then says out loud that it was assumed. |
| `radius_km` | no | How far they are willing to detour, in kilometres, at most 25 (the provider's limit). Example: "10". Defaults to 5. |
| `break_too` | no | "yes" if they also want somewhere to stop and rest, which adds one parking call on the same road. Defaults to "no". |
| `language` | no | Set this to the language the traveller is writing in: "en" for English, "de" for German. It decides both the language you answer in and the language argument you pass to every tool call in the recipe. Leave it out only when the language is genuinely unclear — the fallback is German, because the road is German. |

### `plan_commute`

*Plan today's commute by train — Pendelfahrt für heute planen*

> Plans one public-transport leg on the day itself: the next departures from the station with delays, platforms and cancellations, and whether the region's buses and trains are running normally at this hour. Use when the train is already the decision — a daily commute, or any leg where they need the next departures and nothing else. Do NOT use to weigh rail against driving — that is compare_travel_options — and not for motorway traffic, which is plan_departure. The punctuality figures (share-alike unless VBB answered) stay in their own paragraph; show every attribution line.

| argument | required | description |
| --- | --- | --- |
| `from_station` | **yes** | The station they leave from, as they say it. Example: "Köln Hbf", "Munich Central". |
| `to_station` | no | Where they are heading, used only to pick the right departures out of the board. Example: "Düsseldorf". We hold no journey planner, so this never becomes a route. |
| `when` | no | When they want to leave, in local words or as an ISO-8601 time with offset. Example: "in 20 minutes". Defaults to now. |
| `language` | no | Set this to the language the traveller is writing in: "en" for English, "de" for German. It decides both the language you answer in and the language argument you pass to every tool call in the recipe. Leave it out only when the language is genuinely unclear — the fallback is German, because the road is German. |

### `plan_arrival_parking`

*Where to leave the car on arrival — Parken am Ziel*

> Finds where to leave the car at the end of the drive: the car park in town, the park-and-ride at the edge with the onward departures, or the rest area if the traveller is early. Use when the drive is ending, or whenever someone asks where to put the car. Do NOT use for a refuelling or charging stop — that is plan_fuel_stop — and not for the live road situation, which is plan_departure. A facility that publishes no occupancy is reported as such, never as zero free spaces; show every attribution line.

| argument | required | description |
| --- | --- | --- |
| `destination` | **yes** | Where they want to park — a town, a district, a station or a street address with its postcode. Example: "Köln Innenstadt", "Freiburg Hbf". |
| `kind` | no | Which kind of parking: "car_park" is the enclosed Parkhaus in town, "park_and_ride" the P+R at the edge, "rest_area" the Rastanlage beside a motorway, "truck" a lorry site. Defaults to "any". |
| `arrival` | no | When they arrive, in local words or as an ISO-8601 time with offset. Example: "in 40 minutes". Defaults to now. |
| `language` | no | Set this to the language the traveller is writing in: "en" for English, "de" for German. It decides both the language you answer in and the language argument you pass to every tool call in the recipe. Leave it out only when the language is genuinely unclear — the fallback is German, because the road is German. |

### `find_a_place`

*Find out what a name refers to — Herausfinden, was ein Name meint*

> Resolves a bare name of unknown kind into a place, a named thing, or an address, trying each table in turn and stopping at the first that answers. Use when the traveller names something and you do not yet know whether it is a town, a company, or a street address — or to recover after a tool reported a name as ambiguous. Do NOT use once the kind is already known: a settlement name goes straight to find_place, a company or landmark to find_poi, a street address to find_address. Show every attribution line.

| argument | required | description |
| --- | --- | --- |
| `query` | **yes** | The name to resolve, exactly as the traveller wrote it. Example: "Neustadt", "adesso", "Bahnhofstraße 12, 36037 Fulda". |
| `near` | no | A second place to measure from, used only if find_place answers with more than one candidate for a common name. Example: "Hamburg". |
| `language` | no | Set this to the language the traveller is writing in: "en" for English, "de" for German. It decides both the language you answer in and the language argument you pass to every tool call in the recipe. Leave it out only when the language is genuinely unclear — the fallback is German, because the road is German. |

### `plan_local_errand`

*What is around this place? — Was ist hier in der Nähe?*

> Answers "what is around here" for one place: the nearest fuel, EV charging, parking, railway station and motorway junction in one glance, then — only if the traveller wants more than the nearest one — the depth tool for that one category. Use when it is a quick local stop with nothing decided yet. Do NOT use once the traveller already knows what they need: a fuel grade's price is plan_fuel_stop or find_cheapest_fuel directly, a specific connector or live status is find_charging_station, parking kind or occupancy is find_parking. Show every attribution line.

| argument | required | description |
| --- | --- | --- |
| `place` | **yes** | Where the errand happens — a town, junction, station or street address with its postcode. Example: "Fulda". |
| `need` | no | Narrow the glance to one category when the traveller named one. Defaults to "everything", the full glance across all five categories find_nearby covers. |
| `language` | no | Set this to the language the traveller is writing in: "en" for English, "de" for German. It decides both the language you answer in and the language argument you pass to every tool call in the recipe. Leave it out only when the language is genuinely unclear — the fallback is German, because the road is German. |

### `explain_this_coordinate`

*Say where a coordinate is — Sagen, wo eine Koordinate liegt*

> Turns a bare lat/lon into a sentence a traveller understands: the nearest address, settlement, Kreis, administrative area and motorway junction, each with its own distance. Use whenever you already hold a coordinate — from the traveller, or from another tool's result — and need to say where it is. Do NOT use to look a place up BY NAME: that is find_a_place, find_place, find_poi or find_address. The Kreis/admin-area facts are the nearest gazetteer POINT, not a boundary lookup — admin can be a Regierungsbezirk, not a Land. OpenStreetMap ODbL 1.0 for the address; show the attribution line.

| argument | required | description |
| --- | --- | --- |
| `lat` | **yes** | Latitude of the point, as a decimal degree. Example: "50.5546". |
| `lon` | **yes** | Longitude of the point, as a decimal degree. Example: "9.6773". |
| `language` | no | Set this to the language the traveller is writing in: "en" for English, "de" for German. It decides both the language you answer in and the language argument you pass to every tool call in the recipe. Leave it out only when the language is genuinely unclear — the fallback is German, because the road is German. |

---

Generated from `catalogue.json` by `scripts/gen-api-doc.mjs`. The snapshot was
read from `https://mcp.viafrei.de/mcp` on 2026-10-07; no tool was invoked to
produce it, so no data provider was contacted.
