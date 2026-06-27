# Pet Feeder

WENHOME 3L Automatic Cat Feeder (model YB_5L) converted to local Home Assistant control via ESPHome.

## Hardware

- **MCU:** Puya PY32F003 (ARM Cortex-M0+) — application logic for motor, schedule, sensors
- **Original Wi-Fi:** Tuya WBR3 (RTL8720CF) — removed/silenced in favor of ESP32-S3
- **Replacement board:** ESP32-S3-DevKitC-1, 4MB flash, 80MHz

## Modification

Two-chip TuyaMCU design where the WBR3 and PY32 communicate over 9600-baud UART. The conversion requires **one physical modification** — no soldering:

1. **Silence WBR3:** Jumper WBR3 `EN` pin to GND (reversible)
2. **Wire ESP32-S3 to PY32 UART:**
   - ESP32-S3 RX (GPIO4) → tap PY32 TX line (WBR3 comm-UART pad)
   - ESP32-S3 TX (GPIO5) → tap PY32 RX line (WBR3 comm-UART pad)
   - Baud: 9600, 8N1
3. **Power the ESP32-S3** by tapping the feeder's USB-C 5V rail
4. **Logger** uses `USB_SERIAL_JTAG` (onboard USB, no GPIO collision)

GPIO4 and GPIO5 are clean on the ESP32-S3 — non-strapping, non-USB, non-flash territory.

## How It Works

The feeder uses the **TuyaMCU serial protocol** — you don't control it via GPIO. The ESP32-S3 speaks to the PY32 MCU over UART using Tuya datapoints (DPs):

| DP | Name | Access | Type |
|----|------|--------|------|
| 1 | `meal_plan` | rw | raw (≤128 B) — schedule encoding |
| 3 | `manual_feed` | rw | 1–12 portions |
| 4 | `feed_state` | ro | enum: standby / feeding / done |
| 6 | `food_level` | ro | enum: enough / insufficient / run_out |
| 10 | `battery` | ro | 0–100% |
| 11 | `charge_state` | ro | bool — charging |
| 13 | `fault` | ro | bitmap — jam, food_low, run_out, desiccant, batt_low |
| 14 | `feed_report` | ro | 0–12 portions dispensed |
| 24 | `factory_reset` | rw | bool |

Schedule encoding (dp1): each meal is 5 bytes `[weekday_bitmap][hour][minute][portions][enable]`. Up to 10 meals supported. The ESP32 maintains a persistent cache (NVS) of the MCU-confirmed schedule so the web UI always has data even after reboots.

## What Runs

- **Local LAN control** via ESPHome native API — no cloud, no Tuya dependency
- **Live telemetry:** battery, charging state, food level, feed state, fault detection
- **Manual feed** via button, number entity, or Home Assistant automation
- **Offline schedule execution** — the MCU runs meal plans independently from its own battery, even during total network outage
- **On-device web UI** with schedule management and REST API (JSON patch for schedule CRUD)

## Files

| File | Description |
|------|-------------|
| `pet-feeder.yaml` | Full ESPHome configuration |
| `pet_feeder.h` | Schedule cache struct and helper macros |
| `pet-feeder.js` | On-device web UI (embedded in flash) |

## Datapoint Quick Reference

Schedule write in Home Assistant Developer Tools:

```yaml
action: esphome.pet_feeder_set_meal_plan
data:
  days: [127, 127]       # 127 = every day, 124 = weekdays, 3 = weekend
  hours: [8, 18]
  minutes: [0, 0]
  portions: [3, 4]
  enabled: [true, true]
```

Patch schedule using JSON merge (RFC 7386):

```yaml
action: esphome.pet_feeder_patch_schedule
data:
  patch: '{"3":{"e":false}}'   # toggles slot 3 enable, keeps other fields
```

## Schedule Weekday Bitmaps

| Days | Value |
|------|-------|
| Every day | 127 (0x7F) |
| Weekdays (Mon–Fri) | 124 (0x7C) |
| Weekend (Sat–Sun) | 3 (0x03) |
| Monday | 64 (0x40) |
| Tuesday | 32 (0x20) |
| Wednesday | 16 (0x10) |
| Thursday | 8 (0x08) |
| Friday | 4 (0x04) |
| Saturday | 2 (0x02) |
| Sunday | 1 (0x01) |