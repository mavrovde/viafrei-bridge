# Where the answers come from

Every answer the ViaFrei MCP server gives is built from **official open data**,
and every result says which source it came from. This page is the human-readable
copy of that list: who publishes each dataset, what it covers, how often the
publisher releases it, under which licence, and the **exact attribution line**
that has to travel with the answer.

It is not only a credits page. Several of these licences put obligations on
**you** — the person or product that receives a tool result — and two of them
can be breached without noticing. Those two are first, before the catalogue.

The authoritative, always-current register is the resource
**`viafrei://attribution`** on the server itself. Any MCP client can read it. If
this page and that resource ever disagree, the resource is right and this page is
stale: tell us and we will fix it.

---

## Two obligations that bind the reader

### Fuel prices are consumer information only

Fuel prices come from **MTS-K**, the Markttransparenzstelle für Kraftstoffe at
the Bundeskartellamt, through Tankerkönig. German competition law
(§ 47k GWB) lets a consumer-information service receive them **for one purpose
only**: telling consumers what fuel costs right now.

What that means for you, in plain words:

- **Show the price to the person who asked. Do not redistribute it.** Not the
  raw price, not a table, not a comparison, not an average, not a chart, not a
  "derived" dataset. The Bundeskartellamt's guidance says the form makes no
  difference — real-time or old, raw, reformatted or aggregated — and names
  analyses built from the data as caught too. Tankerkönig's own terms forbid
  passing the data on outright.
- **Never let it reach the fuel industry.** Not mineral-oil companies, station
  operators, their trade bodies, and not the IT providers working for them
  (price reporters, till-system and fuel-card vendors, station IT). If your
  recipient might pass it on to that sector, you may not supply them either.
- The consequence of getting this wrong is not a style complaint: misuse costs
  the licence to receive the data at all — ours, and yours.

### Public-transport realtime is share-alike

Realtime public-transport data comes from **DELFI e.V.** under
**CC BY-SA 4.0**. Share-alike means the obligation travels:

- anything you derive from it — a table of delays, a punctuality figure, a
  screen that reuses the numbers — has to be offered under CC BY-SA 4.0 too;
- you may not blend it into a work you publish under a different licence, which
  in practice means **do not merge a DELFI delay with data you hold under a
  non-compatible licence and ship the mixture**;
- the attribution line stays with it.

If that is not what you want for your product, ask for the same answer from a
source that is not BY-SA, or keep the two apart.

### And one that applies only if you get an address back

Address lookups, **where a deployment has imported the data**, are answered from
**OpenStreetMap** under the **ODbL 1.0**. The public service has not imported it
and answers no house numbers today, so this binds nobody using that service
right now — it is stated because the moment it does, it binds everybody.

ODbL's share-alike is on the *database*, not on the sentence: if you build your
own database out of address results and use it publicly, you owe your recipients
the same offer we make. **Our side of that offer stands** — ODbL § 4.6 — and the
server states it in `viafrei://attribution`: ask, and you get our address extract
and our alterations to it under ODbL 1.0. An issue on this repository reaches
us, and the server's own register names the contact route as well.

---

## The catalogue

**Status is not a promise, it is a measurement.** Every "live" below was checked
by calling the public endpoint on **2026-09-21** and reading which source the
answer named. A source can be licensed, cleared and loaded and still not answer
a question today; where that is so, this page says it.

- **live** — an answer came back naming it when this page was checked;
- **in the service** — licensed and loaded, and the spot check produced no
  answer that named it, so it is reported as unconfirmed rather than as live;
- **not on the public service today** — cleared and built, and it does not
  answer right now. Do not design around it yet;
- **read** — the licence is read and cleared, and nothing uses it yet.

| Source | Publisher | Covers | Publisher's rhythm | Licence | Status |
|---|---|---|---|---|---|
| Motorway traffic | Die Autobahn GmbH des Bundes | Roadworks, warnings, closures, webcams, lorry parking, charging points on the Bundesautobahnen | continuous | open, no licence text published — see below | live |
| Roadworks (DATEX II) | Bundesanstalt für Straßen- und Verkehrswesen (BASt), via the national access point | Arbeitsstellen on the Bundesautobahnen | a few times a day | CC BY 4.0 | live |
| Lorry parking, static | Lkw-Parken BAB Deutschland / BMV, via the national access point | Nationwide lorry parking sites on the Bundesautobahnen | a few releases a year | GeoNutzV | live |
| Fuel prices (MTS-K) | Tankerkönig / Markttransparenzstelle für Kraftstoffe | Prices and station details for German filling stations | continuous, in the publisher's own cycle | CC BY 4.0 **plus the MTS-K purpose limit** | live, **limited coverage** |
| Timetables | Deutsche Bahn AG (DB API Marketplace) | Planned and changed rail departures per station | continuous | CC BY 4.0 | live |
| StaDa — Station Data | Deutsche Bahn AG (DB API Marketplace) | Station master data: name, number, address, coordinates, facilities | static master data | CC BY 4.0 | live |
| Official weather warnings | Deutscher Wetterdienst (DWD) | Amtliche Wetterwarnungen per municipality | as issued | CC BY 4.0, with a source note fixed by law | live |
| Place gazetteer | GeoNames | Populated places and administrative units worldwide, with alternate names | rebuilt daily, taken per release | CC BY 4.0 | live |
| Charging point master data | Eco-Movement, via the national access point | AFIR charge-point master data across many operators | static releases | CC BY 4.0 | live |
| Charging point master data | EnBW AG, via the national access point | AFIR charge-point master data for EnBW mobility+ | static releases | CC BY 4.0 | in the service |
| Charging point availability | Tesla Germany GmbH and Volkswagen Group Charging GmbH, via the national access point | AFIR dynamic status for their own networks | live status | **CC0 1.0** | in the service |
| German road rules | ViaFrei, compiled from official sources | Environmental zones, tolls, equipment duties, charging rules | reviewed at least twice a year | our own text | live |
| Public-transport realtime (GTFS-RT Trip Updates) | DELFI e.V., via the national access point (Mobilithek) | Germany-wide departure and arrival forecasts | real time | **CC BY-SA 4.0** | **not dependable today** — see below |
| FaSta — Facility Status | Deutsche Bahn AG (DB API Marketplace) | Live state of lifts and escalators at stations | live status | CC BY 4.0 | **not on the public service today** |
| Geocoding (addresses) | OpenStreetMap contributors | Street and house-number points in Germany | refreshed from the OSM extract | **ODbL 1.0** | **not on the public service today** |
| Timetable data (static GTFS) | DELFI e.V. | Germany-wide scheduled public transport | weekly release | CC BY 4.0 | read |
| Stop directory (zHV) | DELFI e.V. | Every public-transport stop in Germany with its identifier and coordinates | weekly release | CC BY 4.0 | read |
| Administrative units and place names | Bundesamt für Kartographie und Geodäsie (BKG), product GN250 | Länder, Regierungsbezirke, Kreise, Gemeinden with their official keys and names | yearly release | **dl-de/by-2-0** | read |
| Police traffic events | Landesbetrieb Straßenbau NRW (VIZ.NRW), via the national access point | Police traffic reports, Germany-wide | continuous | **Datenlizenz Deutschland – Zero – 2.0** | read |

Four of those rows need saying out loud rather than in a cell. All four are
places where it would have been easier to write "live" and leave it.

- **Fuel coverage is not nationwide.** We watch a limited set of stations, on
  the terms the publisher sets, and we ask for a station's details only when
  somebody actually asks a question. Outside that set you may get nothing back.
  That is a consequence of the MTS-K rules, not a gap we are hiding.
- **Public-transport realtime is not dependable yet.** The licence is cleared
  and the feed is in the service, but the tool that exposes it was answering
  with an internal error when this page was checked on 2026-09-21. Do not build
  on it until this row says otherwise.
- **Lift and escalator status does not answer today.** The licence is read and
  the tool exists; the station register it needs is not loaded on the public
  host, and the tool says so in as many words rather than reporting that
  everything works.
- **Address lookup is not available on the public service.** Address data is
  imported per deployment and the public one has none, so the service answers
  places, stations and motorways but not house numbers. Where it *is* imported,
  the ODbL obligations below apply in full.

## The sources in detail

Each block gives the licence in the publisher's own words where we have it, and
the attribution line the server emits. **Reproduce the line as written** — these
are not suggestions; CC BY 4.0 § 3 and its equivalents terminate the grant when
the condition is not met.

Why several lines end in `bearbeitet` ("edited"): CC BY 4.0 § 3(a)(1)(B) makes
you indicate that you changed the material. An answer is always a derived form —
a parsed timetable, a summarised warning, a shortened list — so the indication is
owed, and it is part of the string rather than an afterthought.

### Die Autobahn GmbH des Bundes — motorway traffic

Roadworks, warnings, closures, webcams, lorry parking and charging points on the
Bundesautobahnen. Open interface, no key, no account.

```
Verkehrsdaten: Autobahn GmbH des Bundes
```

**Read this before you redistribute.** Autobahn GmbH publishes the data openly
but publishes **no reuse licence text** alongside it — we checked again on
2026-09-21 and found none. We therefore do not claim a grant we cannot quote:
we name the source on every answer, and we treat redistribution beyond showing
the answer as an open question with the publisher rather than as something the
absence of a licence permits. If you intend to republish it, ask them.

Publisher: <https://www.autobahn.de>

### DELFI e.V. — public-transport realtime · CC BY-SA 4.0

Germany-wide GTFS-RT Trip Updates — the live forecast behind a departure board
— published by DELFI e.V. through the national access point (Mobilithek), and
listed on GovData with the licence **CC-BY-SA 4.0** (checked 2026-09-21).

```
Echtzeitdaten: DELFI e.V. via Mobilithek, CC BY-SA 4.0
```

Share-alike. See [the obligation above](#public-transport-realtime-is-share-alike):
what you derive from this stays CC BY-SA 4.0, and it may not be blended into a
result you publish under another licence.

**It is not dependable yet.** Asked twice on 2026-09-21, the tool that exposes
this feed answered with an internal error. The licence work is done and the data
is there; the answer is not, so plan for it rather than on it.

Licence: <https://creativecommons.org/licenses/by-sa/4.0/> ·
publisher: <https://www.opendata-oepnv.de>

Two more DELFI datasets are cleared and not yet in use: the Germany-wide static
timetable (`Fahrplandaten: DELFI e.V., CC BY 4.0, bearbeitet`) and the central
stop directory
(`Haltestellendaten: DELFI e.V. (zentrales Haltestellenverzeichnis), CC BY 4.0, bearbeitet`).
Both are **CC BY 4.0**, not BY-SA — the share-alike is on the realtime feed.

### Tankerkönig / MTS-K — fuel prices · CC BY 4.0 **plus a purpose limit**

```
Tankstellenpreise: Tankerkönig.de — MTS-K, CC BY 4.0, bearbeitet
```

The line must carry a link to
<https://creativecommons.tankerkoenig.de> — naming the source is required
("insbesondere ist eine Namensnennung nötig", read 2026-09-21).

The CC BY licence is **not** the binding constraint here. The MTS-K purpose
limitation sits on top of it and is stricter: consumer information only, no
redistribution in any form, and never to the fuel industry or its IT providers.
The full statement is [at the top of this page](#fuel-prices-are-consumer-information-only).
The publisher's own terms put it bluntly: attempts to pull the data in bulk are
blocked and the key deactivated.

Terms: <https://creativecommons.tankerkoenig.de> · MTS-K guidance for consumer
services: <https://www.bundeskartellamt.de>

The historical price archive published beside the API is licensed
**CC BY-NC-SA** — non-commercial. It is not a source for any answer this
service gives, and it never will be while that licence stands.

### Deutsche Bahn AG — timetables, stations, facilities · CC BY 4.0

Three products on the DB API Marketplace, each read at its own product page.

```
Fahrplandaten: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet
Bahnhofsdaten: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet
Aufzüge und Fahrtreppen: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet
```

The product pages say it in one sentence: *"Dieser Datensatz wird bereitgestellt
unter der Lizenz Creative Commons Attribution 4.0 International (CC BY 4.0)."*
DB adds one carve-out, and it is narrower than it looks: once the data has been
contributed to OpenStreetMap, a mention of Deutsche Bahn AG in the contributor
list is enough. That is a relaxation **for OSM**, not permission to drop the
line from your own results.

Facility status — the live state of lifts and escalators — **does not answer on
the public service today**, for the reason given above. Do not build on it yet.

Publisher: <https://developers.deutschebahn.com>

### Deutscher Wetterdienst — official weather warnings · CC BY 4.0

```
Quelle: Deutscher Wetterdienst
```

The DWD's copyright page, read 2026-09-21: *"Alle frei zugänglichen Geodaten und
Geodatendienste sowie die als hochwertige Datensätze / high value datasets (HVD)
festgelegten Leistungen des DWD dürfen unter den Bedingungen der Lizenz Creative
Commons BY 4.0 (CC BY 4.0) unter Beigabe eines Quellenvermerks weiterverwendet
werden."*

The wording of that source note is **prescribed by law** (§ 7 DWD-Gesetz), which
is why it is three words and why they may not be reworded, translated or
abbreviated. It also has to sit immediately next to the DWD information it
belongs to.

There is a second line, and the difference matters:

```
Datenbasis: Deutscher Wetterdienst, zusammengefasst
```

An **amtliche Wetterwarnung** is official text. Where an answer reproduces the
warning as issued, it carries `Quelle: Deutscher Wetterdienst`. Where it shows
our summary instead of the DWD's own words, the DWD requires the Quellenvermerk
to be **removed** and a changed-data note put in its place — an altered warning
must not look official. That is why you will see one line or the other and never
both. If you rewrite a warning further, the same rule applies to you.

Licence: <https://www.dwd.de/copyright>

### AFIR charging data — CC BY 4.0 and CC0 1.0

Charge-point data reaches us through the national access point under the EU
alternative-fuels rules (AFIR). The licences are **not uniform**, so they are
listed one by one:

```
Ladepunkte: Eco-Movement via Mobilithek, CC BY 4.0, bearbeitet
Ladepunkte: EnBW AG via Mobilithek, CC BY 4.0, bearbeitet
Ladepunkt-Verfügbarkeit: Tesla Germany GmbH via Mobilithek, CC0 1.0
Ladepunkt-Verfügbarkeit: Volkswagen Group Charging GmbH via Mobilithek, CC0 1.0
```

The pattern so far, across the offers we have actually read: the **static**
master-data publications are CC BY 4.0, the **dynamic** availability feeds are
CC0 1.0. It is a pattern and not a rule — "AFIR data is mostly CC0" is a guess
that has been wrong twice — so each new offer gets its licence read before it is
used.

CC0 waives copyright and database rights and attaches **no** condition; we name
those publishers anyway, because an answer should say where it came from. CC0
does not waive trade marks: a name there identifies the source of the data and
nothing else.

Master data — where the posts are, which plug, how many kW — answers today.
**Live availability does not exist for most of Germany**, because only some
operators publish it; a result says how many nearby sites had no status rather
than quietly leaving them out or calling them free.

### OpenStreetMap — geocoding · ODbL 1.0

```
Geokodierung: © OpenStreetMap-Mitwirkende, ODbL 1.0
```

Carried on every answer whose input was an address, and on no other answer: a
result about a station or a place is not OSM-derived and does not pretend to be.

Address data is imported **per deployment**, and the public service has none —
asked for a house number on 2026-09-21 it answers that it can find places,
stations and motorways but not house numbers, which is the right answer rather
than a guessed coordinate. So nothing you get from the public service today
carries this line or this obligation. Where an operator has imported the
extract, both apply in full.

Our ODbL § 4.6 offer is [above](#and-one-that-applies-only-if-you-get-an-address-back).

Licence: <https://opendatacommons.org/licenses/odbl/1-0/> ·
copyright: <https://www.openstreetmap.org/copyright>

### BASt and Lkw-Parken — motorway roadworks and lorry parking

Both arrive through the national access point, and both answer today: planned
roadworks come from BASt, lorry parking sites from the static file below.

```
Arbeitsstellen: Bundesanstalt für Straßen- und Verkehrswesen (BASt) via Mobilithek, CC BY 4.0, bearbeitet
```

The lorry-parking file is published under **GeoNutzV**, which requires a source
note *and* a note that the data was changed. The year in it is the year of the
last download, filled in when the file is taken:

```
LKW-Parken: © Lkw-Parken BAB Deutschland / Bundesministerium für Verkehr (BMV) <Jahr des letzten Datenbezugs> — GeoNutzV, Daten verändert
```

### BKG — administrative units · dl-de/by-2-0

The Bundesamt für Kartographie und Geodäsie publishes GN250 ("Geographische
Namen 1:250 000") free of charge under **Datenlizenz Deutschland –
Namensnennung 2.0**. Openness at the BKG is decided **per product**, so this
covers that one file and nothing else in their catalogue.

The source note is printed on the product's own terms, character for character,
and must be reproduced with the year of the last download filled in — plus a
note that the data was changed, which dl-de/by-2-0 § 3 requires and which we owe
twice over, because we keep a fraction of the rows and reproject every point:

```
Verwaltungseinheiten: © BKG (Jahr des letzten Datenbezugs) dl-de/by-2-0, Datenquellen: https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_gn250.pdf (Daten verändert)
```

Licence: <https://www.govdata.de/dl-de/by-2-0> ·
product: <https://gdz.bkg.bund.de>

### GeoNames — place gazetteer · CC BY 4.0

```
Ortsdaten: © GeoNames (CC BY 4.0), bearbeitet
```

*"This work is licensed under a Creative Commons Attribution 4.0 License"* —
the project's own statement, checked 2026-09-21. Places and administrative
units, with multilingual alternate names; **no streets and no house numbers**,
so it can never answer an address question.

This is what turns "Munich" or "Kreis Fulda" into the coordinates the other
sources are queried with, which is why the line turns up under answers that are
otherwise about weather, fuel or charging: the place came from here.

Licence: <https://www.geonames.org>

### Police traffic events · Datenlizenz Deutschland – Zero – 2.0

```
Verkehrsmeldungen der Polizei: Landesbetrieb Straßenbau NRW (VIZ.NRW) via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0
```

DL-DE/Zero-2.0 attaches **no** condition at all: "Jede Nutzung ist ohne
Einschränkungen oder Bedingungen zulässig." We name the publisher anyway, for
the same reason as the CC0 feeds.

### German road rules — our own text

```
Verkehrsregeln: ViaFrei, eigene Zusammenstellung aus amtlichen Quellen (StVO, StVZO, 35. BImSchV, StVG, EmoG, AFIR); jede Aussage mit Quelle und Prüfdatum — informativ, keine Rechtsberatung
```

Environmental zones, tolls, equipment duties and charging rules are not a feed —
they are a compilation we write ourselves from the statutes, EU law, the
Umweltbundesamt's own lists and the Court of Justice. German statutes are
amtliche Werke and free of copyright; we summarise rather than reproduce, so no
provider licence attaches and we claim none. What every statement does carry is
its official source and the date it was last read, and a statement that lacks
either fails our build rather than reaching you.

It is information, never legal advice.

---

## What we deliberately do not use

Leaving a dataset out is as much a part of "we use all legal ways" as using one:

- **Two motorway datasets on the national access point** are published as
  "restricted use, free of charge" with **no terms behind the label** — one
  attaches a technical document by a different authority, the other attaches
  nothing. No readable terms means no grant to interpret, so nothing is served
  from them and no attribution line for them exists.
- **Eight of the nine DB RIS products** publish no licence at all; their terms
  arrive as a contract after screening. They are not used, and the server
  cannot even name them.
- **The Tankerkönig historical archive** is CC BY-**NC**-SA. Non-commercial is
  incompatible with a commercial service, so it is not in any answer path.

## How this page is kept honest

- The attribution lines live **in the server**, not in this document. Every tool
  result carries the one that belongs to the data that answered it, and the
  register at `viafrei://attribution` is generated from the same place. A line
  that existed only in documentation would be a line nobody emits.
- Every row in our internal register records the licence, the operative sentence,
  the date it was read and who may do what with the data. Rows are re-verified
  **quarterly** and whenever a provider announces a change.
- The dates in this page are the dates the relevant page was read, not the dates
  it was written.
- **The statuses are measured, not declared.** Each one was checked on
  2026-09-21 by asking the public endpoint a question and reading which source
  the answer named. That is why four rows say a source does not answer today
  where the register says the licence is cleared: cleared is not live, and a
  page that blurred the two would be the one thing this page exists not to be.
- Where a source's terms are unknown or unreadable, this page says so instead of
  rounding it up to "open data" — the motorway interface above is named on every
  answer for exactly that reason, and the datasets in the section before this
  one are left alone entirely.

Found something wrong here — a licence that changed, a line that is no longer
what the provider asks for? Open an issue. Getting this right matters more to us
than getting it quickly.
