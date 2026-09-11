# Wearable rollup schema (`schemaVersion: 1`)

The dashboard's Ring tab reads one JSON file per day from `data/ring/<YYYY-MM-DD>.json`.
That file is the entire interface to your wearable. This repo contains no Bluetooth code,
no vendor SDK and no decoders — anything that can write this shape will light up the tab.

The reference producer is [qring](https://github.com/liams975/fitness-ring), which talks BLE to a
COLMI R06. A Garmin exporter, an Oura API poller, or a shell script you write yourself are
equally valid as long as they emit this.

## The one rule: `null` is not zero

Every metric is `number | null`, and `null` means **unknown** — the ring was charging, or
off your finger, or that firmware does not expose the field. It does not mean zero.

Never coerce a missing value to `0`. A day on the charger that reports `steps: 0` silently
becomes a day you didn't walk, and it will drag down every trend and streak that touches it.
Days with no file at all are omitted from range responses rather than zero-filled, which is
why `GET /api/ring/range/30` can return fewer than 30 entries.

## Shape

```jsonc
{
  "schemaVersion": 1,
  "date": "2026-01-15",          // the local calendar day this describes
  "timezone": "Europe/Berlin",   // IANA zone the day boundary was computed in

  "sleep": {
    "totalMin": 431,
    "awakeMin": 22,
    "lightMin": 254,
    "deepMinEstimate": 96,       // "Estimate" is load-bearing: a ring is not an EEG
    "remMin": 81,                // null = this firmware has no REM stage at all
    "start": "2026-01-14T23:12:00+01:00",
    "end": "2026-01-15T07:03:00+01:00",
    "attributedTo": "wakeDate",  // sleep belongs to the day you woke up
    "userEdited": false
  },

  "restingHR": {
    "bpm": 54,
    "method": "overnight-median-lowmotion",  // how it was derived, not just the number
    "n": 212,                                // samples behind it — 0 means don't trust bpm
    "rolling7d": 56,
    "rolling30d": 57
  },

  "activity": {
    "steps": 10636,
    "distanceKm": 8.78,
    "stepGoal": 10000,           // user config, echoed so the UI needn't know it
    "source": "ring"
  },

  "training": {
    "zoneMinutes": { "2": 34, "3": 12, "4": 0, "5": 0 },
    "zone2Minutes": 34,
    "zoneModel": "tanaka-estimate-v1",  // see below
    "hrMaxEstimate": 195,
    "workouts": []
  },

  "device": {
    "battery": 93,
    "lastSync": "2026-01-15T22:28:50+01:00",
    "batteryHistory": {
      "latest": 93,
      "charging": false,
      "samples": [{ "at": "2026-01-15T07:40:41+01:00", "percent": 97, "charging": false }],
      "drainPctPerHour": null
    }
  },

  "quality": {
    "hrCoverage": 0.62,          // 0–1 fraction of the day with usable HR samples
    "flags": ["low-hr-coverage"]
  }
}
```

## `zoneModel`

Names how the heart-rate zone boundaries were produced, because a formula and a measured
value are different kinds of number and the UI refuses to blur them:

| Value | Meaning |
|---|---|
| `tanaka-estimate-v1` | Derived from age. Carries ~7–10 bpm of uncertainty — wider than some zone boundaries. |
| `personal-calibration-v1` | Zone 2 anchored on your own calibration efforts; the rest still estimated. |
| `measured-hrmax-v1` | Based on a measured HRmax. |

Unknown values render as `Zone model: <value>`, so adding your own is safe.

## `quality.flags`

Free-form slugs, surfaced to the reader rather than hidden. Recognised ones get friendly
prose; anything else is shown verbatim.

`no-data`, `low-hr-coverage`, `sleep-stage-span-mismatch`, `implausible-hr-samples:<n>`

## Writing your own producer

1. Emit one file per local day at `data/ring/<YYYY-MM-DD>.json`.
2. Omit the file entirely for days you have nothing for. Do not write a file of zeros.
3. Set `timezone` to the zone you used to decide where the day boundary fell, and keep it
   consistent with `TIMEZONE` in the API and Worker config.
4. Commit the files. The Worker reads them from GitHub at request time; the local Express
   API reads them from disk.

To wire up an on-demand "Sync" button in the local dev server, point `RING_SYNC_SCRIPT` at
an executable that refreshes those files. It runs on loopback only and receives no arguments
from the request. The deployed Worker answers `501` on that route — Cloudflare has no radio.
