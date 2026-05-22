# rdp-flow-card

**Home Assistant Custom Energy Flow Card**

A single-file Lovelace card that renders a live, animated energy-flow diagram for a solar inverter system with battery storage. No build step, no external dependencies — drop in one JavaScript file and configure.

---

## Features

- Animated S-curve energy flow paths (solar → inverter → battery / grid / home)
- Live sun position tracking along an arc using `sun.sun` elevation
- Battery SOC colour coding with dynamic charge/discharge indicator
- Dual battery support (secondary battery, optional)
- EV / car charger node with live state and SOC (optional)
- Extra PV strings PV3 / PV4 (optional)
- PV generation bar and inverter load bar for quick visual reference
- Transparent icon overlays that work on any background colour
- **Automatic dark / light mode** — follows the active HA theme setting
- Full visual editor — no YAML required

---

## Preview

The card adapts to the active HA theme automatically:

![rdp-flow-card preview](card-preview.png)

---

## Installation

### HACS (recommended)

1. In HACS go to **Frontend → ⋮ → Custom repositories**
2. Add `https://github.com/RienduPre/rdp-flow-card` — category **Lovelace**
3. Click **Download**
4. Hard-refresh your browser (`Cmd+Shift+R` / `Ctrl+Shift+R`)

### Manual

1. Copy `dist/rdp-flow-card.js` to `/config/www/rdp-flow-card.js`
2. Go to **Settings → Dashboards → Resources → Add**
   ```
   URL:  /local/rdp-flow-card.js
   Type: JavaScript module
   ```
3. Hard-refresh your browser

---

## Configuration

Add the card to a dashboard view:

```yaml
type: custom:rdp-flow-card
inverter_name: GoodWe

# Solar
pv1_power: sensor.pv1_power
pv2_power: sensor.pv2_power
pv_total_power: sensor.pv_total_power
pv_max_power: 7500

# Grid
grid_active_power: sensor.grid_active_power
grid_import_energy: sensor.grid_import_energy
grid_export_energy: sensor.grid_export_energy
consump: sensor.house_consumption

# Battery
battery_soc: sensor.battery_soc
battery_power: sensor.battery_power
battery_current: sensor.battery_current
battery_voltage: sensor.battery_voltage
battery_full_ah: 314
battery_full_wh: 16076

# Inverter
inv_temp: sensor.inverter_temperature
inverter_max_power: 6000
```

All keys are also available through the built-in visual editor.

---

## Configuration Reference

### Solar

| Key | Default | Description |
|---|---|---|
| `inverter_name` | `''` | Label shown in the inverter node |
| `pv1_power` | `sensor.goodwe_pv1_power` | PV string 1 power (W or kW) |
| `pv2_power` | `sensor.goodwe_pv2_power` | PV string 2 power (W or kW) |
| `pv3_power` | `''` | PV string 3 — requires `_show_pv_extra: true` |
| `pv4_power` | `''` | PV string 4 — requires `_show_pv_extra: true` |
| `pv_total_power` | `sensor.goodwe_pv_power` | Total PV power (W or kW) |
| `pv_max_power` | `7500` | Max PV power for bar scaling (W) |
| `inv_temp` | `sensor.goodwe_inverter_temperature_module` | Inverter temperature |
| `sun` | `sun.sun` | Sun entity for arc position |

### Grid

| Key | Default | Description |
|---|---|---|
| `grid_active_power` | `sensor.goodwe_active_power` | Grid power — negative = exporting (W or kW) |
| `grid_import_energy` | `sensor.goodwe_today_energy_import` | Today grid import (kWh) |
| `grid_export_energy` | `''` | Today grid export (kWh) — optional |
| `invert_grid_power` | `false` | Flip sign — enable if positive = exporting |
| `consump` | `sensor.goodwe_house_consumption` | House consumption (W or kW) |

### Battery

| Key | Default | Description |
|---|---|---|
| `battery_soc` | `sensor.jk_soc` | State of charge (%) |
| `battery_power` | `sensor.jk_power` | Battery power (W or kW) |
| `battery_current` | `sensor.jk_current` | Battery current (A) |
| `battery_voltage` | `sensor.jk_voltage` | Battery voltage (V) |
| `battery_full_ah` | `314` | Battery capacity (Ah) |
| `battery_full_wh` | `16076` | Battery capacity (Wh) |
| `invert_battery_power` | `false` | Flip sign — enable if positive = discharging |

### Secondary Battery (optional)

| Key | Default | Description |
|---|---|---|
| `_show_battery2` | `false` | Enable secondary battery |
| `battery2_soc` | `''` | Secondary SOC (%) |
| `battery2_power` | `''` | Secondary power (W or kW) |
| `battery2_current` | `''` | Secondary current (A) |
| `battery2_voltage` | `''` | Secondary voltage (V) |

### EV / Car Charger (optional)

| Key | Default | Description |
|---|---|---|
| `_show_ev` | `false` | Enable EV node |
| `charger_state` | `''` | Charger state (`charging`, `completed`, `disconnected`, …) |
| `charger_power` | `''` | Charger power (W or kW) |
| `charger_current` | `''` | Charger current (A) |
| `charger_soc` | `''` | Car battery SOC (%) |
| `charger_eta` | `''` | Charge ETA (minutes) |
| `charger_battery_capacity_wh` | `''` | EV battery capacity (Wh) |

### Extra PV Strings (optional)

| Key | Default | Description |
|---|---|---|
| `_show_pv_extra` | `false` | Enable PV3 / PV4 inputs |

### System Limits

| Key | Default | Description |
|---|---|---|
| `inverter_max_power` | `6000` | Inverter max power for bar scaling (W) |

---

## Colour Logic

| Metric | Thresholds |
|---|---|
| **SOC** | ≤25% red · ≤50% orange · ≤75% blue · >75% green |
| **Inverter temp** | ≤25°C green · ≤45°C orange · >45°C red |

---

## Dark / Light Mode

The card automatically switches between dark and light themes based on the active HA theme:

- **Dark** (default) — dark backgrounds, muted borders, light text
- **Light** — white backgrounds, subtle borders, dark text

No configuration required. The card reads `hass.themes.darkMode` on every update and re-renders if the mode changes.

---

## Notes

- The card uses shadow DOM. HA theme CSS variables do not penetrate it — the card manages its own theme via internal CSS custom properties.
- kW sensors are detected automatically and converted to W for display.
- Config keys prefixed with `_` (e.g. `_show_battery2`) are editor visibility toggles stored in card YAML.
- `sun.sun` is needed for the sun arc animation. The rest of the card works without it.

---

## Troubleshooting

**Card does not appear / "Custom element doesn't exist"**
- Confirm the resource is registered under **Settings → Dashboards → Resources**
- Hard-refresh the browser (`Cmd+Shift+R` / `Ctrl+Shift+R`)
- On the mobile app: clear app cache or force-close and reopen

**Entities show `--`**
- Check **Developer Tools → States** — confirm the entity exists and is not `unavailable` or `unknown`
- Entity IDs are case-sensitive
- The card silently skips unavailable states by design

**Flow animations are static**
- Animations only run when the corresponding power value is above zero
- Verify the inverter entities are returning live values

**After a HACS update the card looks wrong**
1. Hard-refresh the browser
2. If the issue persists: **Settings → Dashboards → Resources** → delete and re-add the rdp-flow-card entry
3. Restart Home Assistant and hard-refresh again

**Reporting a bug**
Include: HA version · rdp-flow-card version · browser console errors · relevant card YAML

---

## Changelog

### v1.0
- Dark / light mode: automatic theme detection via `hass.themes.darkMode`; all colours driven by CSS custom properties
- Icon images rendered with `mix-blend-mode: screen` for transparency on any background
- Removed: battery status badge (CHG/DISCHG/IDLE) from card header
- Removed: TOTAL PV GEN tile
- Removed: TEMP, BMS TEMP, ENDURANCE, MIN CELL, MAX CELL, BATT DIS stat tiles
- Removed: inverter summary panel (Today PV, Chg/Dis, Remaining, Today Load)

### v1.0.0
- Initial release as rdp-flow-card, forked and customised from k-flow-card
- Renamed all identifiers and element names to `rdp-flow-card`
- Icons embedded as base64 (no dependency on `/local/community/` path)
- HACS metadata added

---

*rdp-flow-card · https://github.com/RienduPre/rdp-flow-card*
