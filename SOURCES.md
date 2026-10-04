# Where the answers come from

Every answer the ViaFrei MCP server gives is built from **official open data**,
and every result says which source it came from. This page is the human-readable
copy of that list: who publishes each dataset, what it covers, how often the
publisher releases it, under which licence, and the **attribution line** that has
to travel with the answer — shortened by one part, for a reason given where the
lines are printed.

It is not only a credits page. Several of these licences put obligations on
**you** — the person or product that receives a tool result — and two of them
can be breached without noticing. Those two are first, before the catalogue.

The authoritative, always-current register is the resource
**`viafrei://attribution`** on the server itself. Any MCP client can read it. If
this page and that resource ever disagree, the resource is right and this page is
stale: tell us and we will fix it. One row we re-measured on 2026-09-27 disagrees
the other way round — it is named in the catalogue below, at the BKG row, and the
fix belongs to the server rather than to this page. Whatever the surfaces say,
the answer you hold is the thing to read: `_meta.sources` and the attribution
lines on it are produced from the same result you are looking at.

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

Realtime public-transport data comes from **DELFI e.V.** under a Creative
Commons **Attribution-ShareAlike** licence. **The version is an open question and
this page does not invent one** — see the section on this feed below for what the
catalogue and the access point actually state. Treat the share-alike as applying;
do not rely on a particular version for a derivative. Share-alike means the
obligation travels:

- anything you derive from it — a table of delays, a punctuality figure, a
  screen that reuses the numbers — has to be offered under BY-SA too;
- **share-alike reaches adaptations, not aggregations.** If you *modify* the
  data — recompute it, reshape it, **rearrange** it, build a delay table or a
  punctuality series out of it — what you made is Adapted Material under
  art. 1(a), which names material "translated, altered, **arranged**,
  transformed, or otherwise modified", and you must license it under BY-SA
  (art. 3(b)(1)) and pass the licence URI on (art. 3(b)(2)). An arrangement is
  therefore inside the obligation, not outside it. If you merely **show** it
  next to data from another source, that is an aggregation and no ShareAlike
  obligation touches the other source.

  The words quoted above come from the **4.0** text, because 4.0 is the
  text we read. **Which version applies is the open question set out below**,
  and this page does not guess what another version's definition says: the
  vocabulary the catalogue draws on offers three terms — unversioned, 3.0 DE
  and 4.0 — and the middle one is a German port whose definitions are in
  German. "It holds whichever version applies" would have been a claim about
  texts nobody here has opened, which is the same shape as the error corrected
  above.

  Creative Commons' own position: the condition "applies only for works
  considered adaptations under copyright law, not simply in collections with
  other works". An earlier version of this page said you may not blend it into a
  work under a different licence. That was wrong in the direction that matters —
  it told you a licence forbids something it permits, which art. 3(b)(3) is
  itself about not doing to a recipient, and it would have condemned our own
  service, since a weather answer can name `["dwd","osm"]` and a transit answer
  is built on a place resolved from the gazetteer;
- the attribution line stays with it, either way.

If that is not what you want for your product, ask for the same answer from a
source that is not BY-SA, or keep the two apart.

### And one that applies if you get an OpenStreetMap-derived result back

Some answers are built from **OpenStreetMap**, under the **ODbL 1.0**. Address
and point-of-interest lookups always are; so is any other answer whose place our
own gazetteer could not resolve, because place resolution falls through to the
OSM tables. The public service gives such answers, measured on 2026-09-27, so
**this binds you** as soon as one of those tables answered you — not at some
later date, today. An earlier version of this page said the opposite, on the
strength of a measurement taken before the extract was loaded; if you read that
version, re-read this section.

You can tell which answers are affected without guessing, and the test is the
answer rather than the question: the result carries
`OSM-Standortdaten: © OpenStreetMap-Mitwirkende, ODbL 1.0` and names `osm` in
`_meta.sources`. What decides it is **which table answered**, not which tool you
called and not what your input looked like. A place the server resolved from its
own gazetteer does not carry the line, and neither does a station or a motorway;
a place it resolved from OpenStreetMap does — and place resolution falls through
the gazetteer to the OSM tables, so **any** tool that takes a `place` can come
back with an OSM-derived answer. Measured on 2026-09-27: a weather warning asked
for `Zeiss-Großplanetarium` named `["dwd","osm"]` and carried the ODbL line. So
"did I ask for an address?" is the wrong question, and so is "is this a
geocoding tool?" — **read `_meta.sources` and the attribution line on the answer
you actually got.**

ODbL's share-alike is on the *database*, not on the sentence: if you build your
own database out of address or point-of-interest results and use it publicly, you
owe your recipients the same offer we make. **Our side of that offer stands** —
ODbL § 4.6 — and the server states it in `viafrei://attribution`: ask, and you get
**both** our extracts — addresses and points of interest, one file each — and our
alterations to them, under ODbL 1.0 with a single licence notice covering the two.
Both, because a recipient who derived from POI results is entitled to the POI
database and this sentence named only the addresses until 2026-09-27. An issue on
this repository reaches us, and the server's own register names the contact route
as well.

---

## The catalogue

**Status is not a promise, it is a measurement.** Every "live" below **except the
one labelled `not re-measured`** was checked by calling the public endpoint on
**2026-09-27** and reading which source the answer named. A source can be licensed, cleared and loaded and still not answer
a question today; where that is so, this page says it.

The measurement was taken **on 2026-09-27**, when the server exposed sixteen
read-only tools, by calling **fifteen of them — every one except
`find_cheapest_fuel`** — once each, and reading `_meta.sources` out of the result:
not by reading the code, and not by asking whether a feed was running. Thirteen
sources were named by at least one answer. The tool not called is the one whose row
is deliberately not re-measured, and the count says so rather than absorbing it: a
status this page cannot stand behind is worse than an honest gap.

**The server has grown since that measurement, and this page has not re-run it.**
As of the capture shipped alongside this page (2026-10-04, server 1.7.0)
it exposes twenty tools, eighteen of them read-only — the same twenty as on
2026-10-02. Between that measurement and the 2026-10-02 capture it
gained two tools, and both matter here. One is a SECOND fuel tool,
`find_fuel_station`, excluded from any spot check for exactly the same reason
`find_cheapest_fuel` is, and the reason is a licence condition rather than a
convenience: MTS-K sets a minimum interval per station and its terms make needless
querying a real risk to the access itself. **Both fuel tools are excluded, not one.**
The other is `get_departures` (server 1.5.4): scheduled departures from any
public-transport stop, answering from the DELFI static timetable — a source this
page had listed as *read* with nothing using it. Something uses it now, and on
2026-10-02 the server's own answer was that the timetable is not loaded yet; the row
below says exactly that rather than promoting it.

The sentence above therefore describes what was measured on 2026-09-27 and not what
the server offers today. Re-running it would now mean **sixteen** live calls against
real providers: the read-only tools minus the two excluded fuel tools. The count moved
by one because `get_departures` is read-only and not fuel, so a re-run would call
it. Those calls would mostly re-confirm statuses this page already knows, so it is
dated on purpose rather than refreshed on a schedule — and dated is said out loud,
because a measurement silently carried forward under a present-tense sentence is the
failure this section exists to avoid.

- **live** — an answer came back naming it when this page was checked;
- **in the service** — licensed and loaded, and the spot check produced no
  answer that named it, so it is reported as unconfirmed rather than as live;
- **read** — the licence is read and cleared, and no answer has been seen from it:
  because nothing asks it, because what asks it is told the data is not loaded, or
  because what asks it has not been seen to get an answer either way. Where it is not
  simply that nothing asks it, the row says so.

There used to be a fourth value, **not on the public service today**, and no row
carries it any more: the three rows that did now answer. It is removed from this
legend rather than left standing, because a legend entry nothing uses reads as a
status somebody could still be relying on.

| Source | Publisher | Covers | Publisher's rhythm | Licence | Status |
|---|---|---|---|---|---|
| Motorway traffic | Die Autobahn GmbH des Bundes | Roadworks, warnings, closures, webcams, lorry parking, charging points on the Bundesautobahnen | continuous | open, no licence text published — see below | live |
| Roadworks (DATEX II) | Bundesanstalt für Straßen- und Verkehrswesen (BASt), via the national access point | Arbeitsstellen on the Bundesautobahnen | a few times a day | CC BY 4.0 | live |
| Lorry parking, static | Lkw-Parken BAB Deutschland / BMV, via the national access point | Nationwide lorry parking sites on the Bundesautobahnen | a few releases a year | GeoNutzV | live |
| Fuel prices (MTS-K) | Tankerkönig / Markttransparenzstelle für Kraftstoffe | Prices and station details for German filling stations | continuous, in the publisher's own cycle | CC BY 4.0 **plus the MTS-K purpose limit** | live, **limited coverage**, **not re-measured** — see below |
| Timetables | Deutsche Bahn AG (DB API Marketplace) | Planned and changed rail departures per station | continuous | CC BY 4.0 | live |
| StaDa — Station Data | Deutsche Bahn AG (DB API Marketplace) | Station master data: name, number, address, coordinates, facilities | static master data | CC BY 4.0 | live |
| Official weather warnings | Deutscher Wetterdienst (DWD) | Amtliche Wetterwarnungen per municipality | as issued | CC BY 4.0, with a source note fixed by law | live |
| Place gazetteer | GeoNames | Populated places and administrative units worldwide, with alternate names | rebuilt daily, taken per release | CC BY 4.0 | live |
| Charging point master data | Eco-Movement, via the national access point | AFIR charge-point master data across many operators | static releases | CC BY 4.0 | live |
| Charging point master data | EnBW AG, via the national access point | AFIR charge-point master data for EnBW mobility+ | static releases | CC BY 4.0 | in the service |
| Charging point availability | Tesla Germany GmbH and Volkswagen Group Charging GmbH, via the national access point | AFIR dynamic status for their own networks | live status | **CC0 1.0** | in the service |
| German road rules | ViaFrei, compiled from official sources | Environmental zones, tolls, equipment duties, charging rules | reviewed at least twice a year | our own text | live |
| Public-transport realtime (GTFS-RT Trip Updates) | DELFI e.V., via the national access point (Mobilithek) | Germany-wide departure and arrival forecasts | real time | **CC BY-SA (version unstated)** | live |
| FaSta — Facility Status | Deutsche Bahn AG (DB API Marketplace) | Live state of lifts and escalators at stations | live status | CC BY 4.0 | live |
| Geocoding (addresses and points of interest) | OpenStreetMap contributors | Street and house-number points and mapped points of interest in Germany | refreshed from the OSM extract | **ODbL 1.0** | live |
| Timetable data (static GTFS) | DELFI e.V. | Germany-wide scheduled public transport | weekly release | CC BY 4.0 | read — asked by `get_departures` since server 1.5.4; on 2026-10-02 the server answered that the timetable is not loaded yet, and said so rather than inventing a board |
| Stop directory (zHV) | DELFI e.V. | Every public-transport stop in Germany with its identifier and coordinates | weekly release | CC BY 4.0 | read — `get_departures` resolves stop names against it since server 1.5.4; the 2026-10-02 answer named no stop and said only that the timetable is not loaded, so whether the directory answered cannot be read off it |
| Disruption reports (Störungsmeldungen) | DELFI e.V., via the national access point (Mobilithek) | Germany-wide public-transport disruption messages | real time | **CC BY-SA 4.0** | read |
| Station car parks (DB BahnPark) | Deutsche Bahn AG (DB API Marketplace) | Car parks at railway stations, with their operator and access details | continuous | **dl-de/by-2-0** | read |
| Administrative units and place names | Bundesamt für Kartographie und Geodäsie (BKG), product GN250 | Länder, Regierungsbezirke, Kreise, Gemeinden with their official keys and names | yearly release | **dl-de/by-2-0** | live |
| Police traffic events | Landesbetrieb Straßenbau NRW (VIZ.NRW), via the national access point | Police traffic reports, Germany-wide | continuous | **Datenlizenz Deutschland – Zero – 2.0** | in the service — see below |

Two of those rows need saying out loud rather than in a cell, because a cell
cannot carry a reason — fuel takes two bullets, because the coverage limit and
the decision not to re-measure are different facts.

- **Fuel coverage is not nationwide.** We watch a limited set of stations, on
  the terms the publisher sets, and we ask for a station's details only when
  somebody actually asks a question. Outside that set you may get nothing back.
  That is a consequence of the MTS-K rules, not a gap we are hiding.
- **Fuel is the one row not re-measured on 2026-09-27, and that was deliberate.**
  MTS-K sets a minimum interval per station and its terms make needless querying
  a real risk to the access itself, so this page does not spend a request on
  proving a status it already knew. The cell is carried forward from the previous
  check and labelled `not re-measured` rather than dressed up as today's
  measurement. Everything else in the table was called.
- **Police traffic events are stored, and on 2026-09-27 no answer named them.**
  It is polled and its rows are kept. The status is a statement about the
  answers, not about the code: `check_road_status` was called on the A40, A3,
  A1, A57 and A46 — VIZ.NRW's own Land — and named only the motorway interface
  and the BASt roadworks feed. So by the rule at the top of this section the
  row reads `in the service` and not `live`. What it does **not** say is that no
  tool can reach the feed: whether a source is named is decided by a live
  catalogue row rather than by code, so this row could begin carrying its
  attribution line with no release at all. Do not design around it yet — and
  read `_meta.sources`, not this page, on the day you do.

**What changed on 2026-09-27, stated plainly because this page said the
opposite until today.** Address lookup, lift and escalator status, and
public-transport realtime were all listed as not answering. All three now
answer, and each was confirmed by a call whose result named the source: OSM for
addresses and points of interest, FaSta for lifts and escalators, DELFI for
realtime. The BKG administrative gazetteer was listed as merely `read` and is
in fact named by answers from five different tools. If you read an earlier
version of this page and concluded something was unavailable, re-check it here.

**And one row where this page is newer than the register.** BKG is `live` here, on
five measured answers, while `viafrei://attribution` carries it as planned —
"licence read, data not ingested yet". The answers decide it, and one part of an
answer decides it: `bkg_gvisys` appeared in `_meta.sources`, and only a row that
answered can put an id there. The attribution line came with it, which is
corroboration and not proof — that line is rendered from whichever ids a result
carries and knows nothing about whether the data is loaded. The flag is a server-side change and the server is
where it will be fixed.

**Do not read that as "one" being measured across the table.** It is the only
disagreement among the rows this page re-measured on 2026-09-27, which is not the
same statement. The nearest other candidate is the DELFI stop directory (zHV),
flagged the same way on the same day: we asked for a stop by name and the station
directory answered instead (`db_stada`, with BKG and GeoNames), which is consistent
with the flag and a long way from proof — stops and stations live in the same table
and the resolver ranks them, so a station hit can hide a stop row completely.
Asking a question is not reading the server's table, and this is reported as the
weaker thing it is. **What settles any of
these for you is the answer in your hand**: read `_meta.sources` and the
attribution lines on the result, never a status cell on a page that was printed
before you asked.

## The sources in detail

Each block gives the licence in the publisher's own words where we have it, and
the attribution line that belongs to that source.

**Reproduce the line as you received it from the server, not as it is printed
here.** The lines below are shortened: every attribution line in a real tool
result ends with the source URI in parentheses, and this page leaves that URI
off on purpose — a public page in this repository does not carry deep links into
the catalogues we fetch through. CC BY 4.0 § 3(a)(1)(A)(iv) makes you retain a
URI the licensor supplied, so the copy in the tool result is the one that
discharges the obligation and the copies here are for reading, not for pasting.
Same text, one part deliberately missing; if you have the result, use the
result, and `viafrei://attribution` carries every line in full.

The obligation itself is not a suggestion: CC BY 4.0 § 3 and its equivalents
terminate the grant when the condition is not met.

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

### DELFI e.V. — public-transport realtime · CC BY-SA (version unstated)

Germany-wide GTFS-RT Trip Updates — the live forecast behind a departure board
— published by DELFI e.V. through the national access point (Mobilithek), and
listed on GovData under a Creative Commons **Attribution-ShareAlike** licence.

**The version is an open question, and this page will not invent one.** The
GovData catalogue record for this feed carries the *unversioned* licence URI
`http://dcat-ap.de/def/licenses/cc-by-sa` on its only resource (read 2026-09-27).
The dataset-level licence field is empty, which is **not** evidence of anything —
in DCAT-AP.de the licence lives on the distribution, and every record sampled from
this catalogue has it empty at dataset level, the versioned siblings included. The
resource field is the one that speaks. Per the dcat-ap.de vocabulary that is
a distinct term from `…/cc-by-sa/4.0`. It is not a habit of the publisher's
either: DELFI's sibling records in the same catalogue *are* versioned — the
GTFS-RT Service Alerts feed carries `cc-by-sa/4.0` and the static timetable
`cc-by/4.0` — so DELFI states a version when it means one, and on this feed it
did not. An earlier version of this page said GovData listed the feed as
CC-BY-SA 4.0; that reading could not be reproduced and the claim is withdrawn.

Why it is not pedantry: art. 3(b)(1) sets the Adapter's Licence to "the same
License Elements, this version or later, or a BY-SA Compatible License", so the
version decides what a recipient may put on a derivative — and 3.0 unported has
no express sui-generis-database-rights clause where 4.0 art. 4 does, which is
exactly the derived-delay-table case. **Treat it as CC BY-SA and assume the
share-alike applies; do not rely on a specific version for a derivative.**

The authoritative field says the same thing. The national access point's own
metadata for this feed, read 2026-09-27, carries:

```
standardLicense         : http://dcat-ap.de/def/licenses/cc-by-sa
customLicenseAsResource : null
sourceNote              : null
```

So GovData's harvest is faithful and there is no versioned statement anywhere in
the chain, and the attribution string the server emits says exactly that: the
licence is CC BY-SA and the version is unstated. It named 4.0 until v1.4.1, which
corrected it at the source rather than by rewording this page — what this page
documents is what the server actually sends.

```
Echtzeitdaten: DELFI e.V. via Mobilithek, CC BY-SA
```

Share-alike. See [the obligation above](#public-transport-realtime-is-share-alike):
what you *derive* from this stays BY-SA — an adaptation, including a
rearrangement — while merely showing it beside another source's data is an
aggregation and constrains that other source not at all. The licence **version**
is the open question set out below; treat the share-alike as applying regardless.

**It answers.** Asked for Hamburg on 2026-09-27, `check_transit_disruption`
returned a region-wide punctuality answer naming this feed. Until 2026-09-21 the
same call produced an internal error and this page said so; that is fixed, and
the paragraph is left here rather than deleted so a reader who saw the old one
knows which of the two is current.

What it answers is a **region**, not a line: see the scope note in the
README — no tool here answers "is the S1 on time".

Licence family: Creative Commons Attribution-ShareAlike — the catalogue and the
access point both state the term without a version, so no version URL is given
here on purpose. The 4.0 text, for reference only:
<https://creativecommons.org/licenses/by-sa/4.0/> ·
publisher: <https://www.opendata-oepnv.de>

**Three** more DELFI datasets are cleared and not yet in use, and they do not
share one licence:

- the Germany-wide static timetable — `Fahrplandaten: DELFI e.V., CC BY 4.0, bearbeitet` — **CC BY 4.0**;
- the central stop directory — `Haltestellendaten: DELFI e.V. (zentrales Haltestellenverzeichnis), CC BY 4.0, bearbeitet` — **CC BY 4.0**;
- the disruption reports — `Störungsmeldungen: DELFI e.V. via Mobilithek, CC BY-SA 4.0` — **CC BY-SA 4.0, share-alike**.

This page said "two, both CC BY 4.0 — the share-alike is on the realtime feed"
until 2026-09-27, and both halves were wrong: there are three, and the
share-alike is on **two** DELFI feeds, the trip updates we serve today and the
disruption reports we do not serve yet. If you are planning for the day the
disruption feed appears, plan for share-alike, not for CC BY.

### Tankerkönig / MTS-K — fuel prices · CC BY 4.0 **plus a purpose limit**

```
Tankstellenpreise: Tankerkönig.de — MTS-K, CC BY 4.0, bearbeitet
```

This is the one line whose **link is part of the obligation** rather than part
of the server's formatting: naming the source is required and the publisher
names a link as the way to do it ("insbesondere ist eine Namensnennung nötig",
read 2026-09-21), so the line must carry
<https://creativecommons.tankerkoenig.de> wherever it appears.

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

### Deutsche Bahn AG — timetables, stations, facilities, station car parks

**Four** products on the DB API Marketplace, each read at its own product page,
and they do **not** share one licence. The three we serve are CC BY 4.0:

```
Fahrplandaten: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet
Bahnhofsdaten: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet
Aufzüge und Fahrtreppen: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet
```

The fourth is read and not yet held — station car parks, under **Datenlizenz
Deutschland – Namensnennung – Version 2.0**, which is a different licence with a
different attribution line:

```
Parking Information Daten der DB BahnPark – API über den DB API Marketplace
```

It is in the table because this page is the register and a row is how we say a
licence has been read. It is `read`, so no answer carries that line today; the
line is here so that nobody has to go and find it on the day one does. Do not
assume the CC BY 4.0 line above covers it — one publisher, four products, two
licences.

The product pages say it in one sentence: *"Dieser Datensatz wird bereitgestellt
unter der Lizenz Creative Commons Attribution 4.0 International (CC BY 4.0)."*
DB adds one carve-out, and it is narrower than it looks: once the data has been
contributed to OpenStreetMap, a mention of Deutsche Bahn AG in the contributor
list is enough. That is a relaxation **for OSM**, not permission to drop the
line from your own results.

Facility status — the live state of lifts and escalators — **answers on the
public service**: asked for Köln Messe/Deutz on 2026-09-27 it returned ten
facilities with their states, naming this feed and the station directory that
resolves the name to the number the feed is keyed by. Until the directory was
loaded the lookup stopped before it started, and this page said not to build on
it; that is no longer the case.

The station directory is still what the lookup depends on, so a station missing
from it produces "I cannot resolve that station" rather than an empty facility
list — the distinction matters if you are deciding whether to retry.

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

§ 7 DWD-Gesetz — headed *Quellenschutz* — makes the source note a legal **duty**:
distribution of DWD data, products and special services, warnings in particular,
"ist nur unter Angabe der Quelle zulässig". Its second sentence adds that fuller
protection under the Urheberrechtsgesetz "bleibt davon unberührt", so attribution
is the statute's minimum and not necessarily the whole of what is owed. It
prescribes no wording at all — an earlier version of this
page said the statute fixed the three words, which it does not. The **wording**
is set by the DWD itself, in *Vorgaben für die Gestaltung des
DWD-Quellenvermerks*: either the text form `Quelle: Deutscher Wetterdienst` or
the DWD logo, placed "unmittelbar an der verwendeten DWD-Information".
Reproduce the text form as it stands — it is the publisher's prescribed form and
shortening it defeats its purpose — but the constraint is the DWD's guidance, not
the statute's characters. It also has to sit immediately next to the DWD information it
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
operators publish it. A result marks every such site `keine Statusdaten` and
closes with a sentence saying that this means unknown and not free — measured on
2026-09-27, asking for Leipzig. It does not count them for you, and this page
said it did until today; what it does is refuse to leave them out or to call them
free, which is the part that matters when you act on the answer.

### OpenStreetMap — addresses and points of interest · ODbL 1.0

```
OSM-Standortdaten: © OpenStreetMap-Mitwirkende, ODbL 1.0
```

**Reproduce that line, not a shorter one.** This page printed
`Geokodierung: …` until 2026-09-27 and no answer has carried that prefix since the
release in which `find_poi` and `find_address` began returning an OSM row **as**
the answer — a name, a brand, a door — rather than only a coordinate resolved from
one. `Geokodierung` describes the narrower thing and would have been a false
statement about what the data was used for. If you copied the old string, change it.

**Which answers carry it**, in the platform's own words — verbatim, with the
qualifier emphasised here because it is the part two earlier versions of this
page dropped: *"Only results whose
input resolved through one of these two OSM tables carry this line. A result about
a place **from our own gazetteer**, a station or a motorway is not built from
OpenStreetMap and carries neither the ODbL attribution nor the obligation."*

Read the qualifier. The predicate is **which table answered**, and it is not a
list of tools. Place resolution falls through the gazetteer to the OSM tables, so
a tool that takes a `place` — a weather warning, a road status, a charging
station, a car park, `find_nearby` — returns an OSM-derived answer whenever the
gazetteer did not know the name. Measured on 2026-09-27: a weather warning for
`Zeiss-Großplanetarium` named `["dwd","osm"]` and carried this line; one for
`Allianz Arena` named `["osm"]` alone.

Two wrong versions of this sentence have now been caught, and both erred the same
way, towards telling a reader an obligation did not apply. **One of them shipped.**
1.3.12 said the line was carried "on every answer whose input was an address, and
on no other answer" — false for `find_poi`, and published. The second never
shipped: it was written while fixing the first and caught in review. It said "an
answer about a place, a station or a motorway does not", which drops the four
words that make it true and is false for every place the gazetteer could not
resolve. Two rounds of correcting one sentence is the reason the paragraph above
now states a predicate instead of listing tools or input shapes.

The positive test is the one to rely on: **read `_meta.sources` and the attribution
line on the answer you actually got.** Do not infer either from the shape of your
question.

Address data is imported **per deployment**, and the public service has it:
asked for a house number on 2026-09-27 it answered with the address and this
line. **So the line and the obligation apply to what you get from the public
service today.** How complete that import is was measured the same day from the
service's own per-Land verdict — which reads both tables, names any missing Land and exits
non-zero on one — rather than extrapolated from a single lookup: **all sixteen
Länder are imported, and every row is scoped to the Land it came from.** Two
address lookups in the two Länder least likely to have been staged —
Mecklenburg-Vorpommern and Saarland, asked in Rostock and Saarbrücken — both
answered through the public endpoint with `osm` in `_meta.sources`, over OSM data
dated 2026-09-22. No row count is written here on
purpose: it would be true the day it was typed and stale at the next import, and
reporting it is the verdict's job rather than this page's. One caveat, because it
nearly misled this very measurement — **a single address that does not resolve
says nothing about its Land**: a market-square house number in Erfurt came back
unfound from a Land that is fully imported, because that address is not in
OpenStreetMap under the spelling it was asked for. (The postcode is left out on
purpose - the leak sweep refuses a bare five-digit number in this repository, and
an allow-list entry added to carry an example would be a caption pointing at a
value.) Until the extract was loaded they did not, and this page said
so — the correction is the substantive one in this release.

A deployment that has not imported the extract answers that it can find places,
stations and motorways but not house numbers, which is the right answer rather
than a guessed coordinate. There, neither this line nor the obligation arises,
because no OSM-derived answer is produced.

Our ODbL § 4.6 offer is [above](#and-one-that-applies-if-you-get-an-openstreetmap-derived-result-back).

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
  2026-09-27 by asking the public endpoint a question and reading which source
  the answer named — except the fuel row, which says `not re-measured` for the
  reason given above. That is why **three** rows say a source is loaded but not
  confirmed by an answer where the register says the licence is cleared — EnBW
  static, the Tesla/VW availability feeds, and the police traffic events, which
  moved into that state in this release: cleared is not live, and a page that
  blurred the two would be the one thing this page exists not to be. The number is
  written here because it is small enough to count; if it stops matching the table,
  the table is right.
- Where a source's terms are unknown or unreadable, this page says so instead of
  rounding it up to "open data" — the motorway interface above is named on every
  answer for exactly that reason, and the datasets in the section before this
  one are left alone entirely.

Found something wrong here — a licence that changed, a line that is no longer
what the provider asks for? Open an issue. Getting this right matters more to us
than getting it quickly.
