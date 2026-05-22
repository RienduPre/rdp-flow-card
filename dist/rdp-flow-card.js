// rdp-flow-card.js – Unified Edition v1.1.1
// Changes v1.1.1:
//   - Sun position: replaced azimuth-based t (wrong at non-equatorial locations) with
//     time-based t using today's actual rise/set, derived by correcting next_rising/
//     next_setting when they refer to tomorrow (>18 h away).
//   - Moon position: independent tMoon computed from elapsed night time — fixes the
//     broken (1-t) formula that was wrong when t was re-mapped for night azimuth.
//   - _val(): now accepts toWatts=true — auto-converts kW sensors to W. Applied to
//     all power entity reads (PV strings, pv_total, grid, load, battery, charger).
//   - _readNum(): guards unavailable/unknown state (was only checking !s).
//   - _fmtEndurance(): minutes now uses Math.floor to prevent showing 60m.
//   - gridImg glow: fixed filter condition to use Math.abs(gridActive) so grid export
//     also triggers the glow (was only triggering on import).
// Changes v1.0.1:
//   - Labels section: switchRow replaced by header chip (+ Enable / ✓ Enabled style).
//   - Per-row auto-enable: each entity picker unlocks only when its label text ≠ default.
//   - Corresponding Battery/Solar pickers lock per-row (not globally).
//   - _updateDynamic: clean _rowActive + _readNum/_readStr helpers.
//   - _set: re-renders on any of the 6 label text key changes.

// ═══════════════════════════════════════════════════════════════
// VISUAL EDITOR
// ═══════════════════════════════════════════════════════════════
class RdpFlowCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._attached = false;
    this._rendered = false;
    this._ownChange = false;
  }

  connectedCallback() {
    this._attached = true;
    this._render();
  }

  setConfig(config) {
    this._config = { ...config };
    if (this._ownChange) return;
    if (this._attached) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered && this._attached) {
      this._render();
    } else {
      this.querySelectorAll('ha-selector').forEach(el => { el.hass = hass; });
    }
  }

  _fireChanged() {
    this._ownChange = true;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: { ...this._config } },
      bubbles: true,
      composed: true,
    }));
    Promise.resolve().then(() => { this._ownChange = false; });
  }

  _set(key, value) {
    if (this._config[key] === value) return;
    this._config = { ...this._config, [key]: value };
    this._fireChanged();
    if (key === '_show_battery' || key === '_show_battery2' || key === '_show_pv_extra' ||
        key === '_show_ev'      || key === '_show_limits'   || key === '_labels_custom_entities' ||
        key === 'label_cell_temp_minmax' || key === 'label_bms_temp'   ||
        key === 'label_min_cell'         || key === 'label_max_cell'   ||
        key === 'label_batt_dis'         || key === 'label_total_pv_gen')
      this._render();
  }

  _render() {
    if (!this._hass) return;
    if (!this._sectionOpen) this._sectionOpen = {};
    const cfg = this._config;
    const showBatt1 = !!(cfg._show_battery !== false);
    const showBatt2 = !!(cfg._show_battery2);
    const showPVExtra = !!(cfg._show_pv_extra);
    const showEV = !!(cfg._show_ev);
    const showLimits = !!(cfg._show_limits);

    const style = `
      <style>
        :host { display: block; font-family: var(--paper-font-body1_-_font-family, inherit); }
        .section {
          margin-bottom: 16px;
          border: 1px solid var(--divider-color, rgba(0,0,0,.12));
          border-radius: 10px;
          overflow: hidden;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: var(--secondary-background-color, rgba(0,0,0,.04));
          font-size: .82rem;
          font-weight: 700;
          letter-spacing: .5px;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          cursor: default;
        }
        .section-header.toggleable { cursor: pointer; user-select: none; }
        .section-header .toggle-chip {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: .72rem;
          font-weight: 600;
          letter-spacing: .3px;
          text-transform: none;
          padding: 2px 10px 2px 6px;
          border-radius: 20px;
          background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, rgba(0,0,0,.15));
          color: var(--primary-text-color);
          transition: background .15s;
        }
        .section-header .toggle-chip.on {
          background: var(--primary-color, #03a9f4);
          border-color: var(--primary-color, #03a9f4);
          color: #fff;
        }
        .section-body { padding: 12px 14px 4px; }
        .row {
          display: block;
          margin-bottom: 6px;
        }
        .row-label {
          display: block;
          font-size: .78rem;
          font-weight: 500;
          color: var(--primary-text-color);
          margin-bottom: 3px;
          padding-left: 2px;
          line-height: 1.3;
        }
        .row-label small {
          display: inline;
          font-size: .68rem;
          color: var(--secondary-text-color);
          margin-left: 5px;
        }
        .row-input { display: block; width: 100%; }
        ha-selector, ha-textfield { width: 100%; display: block; }
        ha-textfield { --mdc-shape-small: 6px; }
        .divider { height: 1px; background: var(--divider-color, rgba(0,0,0,.08)); margin: 4px 0 14px; }
      </style>
    `;

    const shell = document.createElement('div');
    shell.innerHTML = style;

    const makeSection = (sectionId, icon, title, rows, opts = {}) => {
      if (this._sectionOpen[sectionId] === undefined) this._sectionOpen[sectionId] = false;
      const isOpen = this._sectionOpen[sectionId];
      const sec = document.createElement('div');
      sec.className = 'section';
      const hdr = document.createElement('div');
      hdr.className = 'section-header toggleable';
      // Chevron — styled as a small disclosure button
      const chevron = document.createElement('span');
      chevron.textContent = isOpen ? '▼' : '▶';
      chevron.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'width:20px',
        'height:20px',
        'min-width:20px',
        'border-radius:5px',
        'background:var(--secondary-background-color,rgba(255,255,255,.07))',
        'border:1px solid var(--divider-color,rgba(255,255,255,.15))',
        'font-size:.7rem',
        'line-height:1',
        `color:${isOpen ? 'var(--primary-color,#03a9f4)' : 'var(--secondary-text-color,#aaa)'}`,
        'flex-shrink:0',
        'transition:color .15s,background .15s',
        'cursor:pointer',
        'user-select:none',
      ].join(';');
      hdr.appendChild(chevron);
      const titleSpan = document.createElement('span');
      titleSpan.textContent = `${icon} ${title}`;
      hdr.appendChild(titleSpan);
      // Click anywhere on header (except toggle-chip) to collapse/expand
      hdr.addEventListener('click', () => {
        this._sectionOpen[sectionId] = !this._sectionOpen[sectionId];
        this._render();
      });
      if (opts.toggleKey) {
        const chip = document.createElement('span');
        chip.className = 'toggle-chip' + (opts.toggleOn ? ' on' : '');
        chip.innerHTML = opts.toggleOn ? `✓ Enabled` : `＋ Enable`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          this._set(opts.toggleKey, !opts.toggleOn);
        });
        hdr.appendChild(chip);
      }
      sec.appendChild(hdr);
      // Body visible when section is open AND content not suppressed by toggle
      const bodyVisible = isOpen && !opts.hidden;
      if (bodyVisible) {
        const body = document.createElement('div');
        body.className = 'section-body';
        rows.forEach(r => body.appendChild(r));
        sec.appendChild(body);
      }
      return sec;
    };

    const picker = (key, label, optional = false) => {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.marginBottom = '14px';
      const lbl = document.createElement('div');
      lbl.className = 'row-label';
      lbl.textContent = label;
      if (optional) {
        const sm = document.createElement('small');
        sm.textContent = 'optional';
        lbl.appendChild(sm);
      }
      const inputWrap = document.createElement('div');
      inputWrap.className = 'row-input';
      const sel = document.createElement('ha-selector');
      sel.hass = this._hass;
      sel.selector = { entity: {} };
      sel.value = cfg[key] || '';
      sel._configKey = key;
      sel.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this._set(key, ev.detail.value || '');
      });
      inputWrap.appendChild(sel);
      wrap.appendChild(lbl);
      wrap.appendChild(inputWrap);
      return wrap;
    };

    // Text field — native input, commits on blur/Enter only.
    // ha-selector(text) fires value-changed per keystroke → triggers setConfig → _render → destroys field.
    const textField = (key, label, placeholder = '') => {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.marginBottom = '14px';
      const fieldBox = document.createElement('div');
      fieldBox.style.cssText = `
        display:block; position:relative;
        border:1px solid var(--divider-color, rgba(0,0,0,.42));
        border-radius:4px;
        padding:6px 12px 6px;
        background:var(--input-fill-color, var(--secondary-background-color, rgba(0,0,0,.04)));
        box-sizing:border-box; width:100%;
        transition: border-color .15s;
      `;
      fieldBox.addEventListener('focusin',  () => { fieldBox.style.borderColor = 'var(--primary-color, #03a9f4)'; });
      fieldBox.addEventListener('focusout', () => { fieldBox.style.borderColor = 'var(--divider-color, rgba(0,0,0,.42))'; });
      const lbl = document.createElement('div');
      lbl.textContent = label;
      lbl.style.cssText = `font-size:.72rem; color:var(--secondary-text-color); margin-bottom:2px; line-height:1;`;
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.value = cfg[key] !== undefined ? String(cfg[key]) : '';
      input.style.cssText = `
        display:block; width:100%; border:none; outline:none;
        background:transparent; color:var(--primary-text-color);
        font-size:.95rem; font-family:inherit; padding:0; box-sizing:border-box;
      `;
      // Commit ONLY on blur or Enter — prevents per-keystroke re-render
      const commit = (ev) => this._set(key, ev.target.value);
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.target.blur(); });
      fieldBox.appendChild(lbl);
      fieldBox.appendChild(input);
      wrap.appendChild(fieldBox);
      return wrap;
    };

    // Number field — native input, commits on blur/Enter only (same reason as textField).
    const numberField = (key, label, min, max, step, unit = '') => {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.marginBottom = '14px';
      const fieldBox = document.createElement('div');
      fieldBox.style.cssText = `
        display:block; position:relative;
        border:1px solid var(--divider-color, rgba(0,0,0,.42));
        border-radius:4px;
        padding:6px 12px 6px;
        background:var(--input-fill-color, var(--secondary-background-color, rgba(0,0,0,.04)));
        box-sizing:border-box; width:100%;
        transition: border-color .15s;
      `;
      fieldBox.addEventListener('focusin',  () => { fieldBox.style.borderColor = 'var(--primary-color, #03a9f4)'; });
      fieldBox.addEventListener('focusout', () => { fieldBox.style.borderColor = 'var(--divider-color, rgba(0,0,0,.42))'; });
      const lbl = document.createElement('div');
      lbl.textContent = unit ? `${label}  (${unit})` : label;
      lbl.style.cssText = `font-size:.72rem; color:var(--secondary-text-color); margin-bottom:2px; line-height:1;`;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = cfg[key] !== undefined && cfg[key] !== '' ? String(cfg[key]) : '';
      input.style.cssText = `
        display:block; width:100%; border:none; outline:none;
        background:transparent; color:var(--primary-text-color);
        font-size:.95rem; font-family:inherit; padding:0; box-sizing:border-box;
      `;
      // Commit ONLY on blur or Enter — prevents per-keystroke re-render
      const commit = (ev) => { const v = parseFloat(ev.target.value); if (!isNaN(v)) this._set(key, v); };
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.target.blur(); });
      fieldBox.appendChild(lbl);
      fieldBox.appendChild(input);
      wrap.appendChild(fieldBox);
      return wrap;
    };


    // Native CSS pill toggle
    const switchRow = (key, labelText, hintText = '') => {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.cssText = 'margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;';
      const left = document.createElement('div');
      left.style.flex = '1';
      const lbl = document.createElement('div');
      lbl.className = 'row-label';
      lbl.style.marginBottom = '2px';
      lbl.textContent = labelText;
      left.appendChild(lbl);
      if (hintText) {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:.68rem;color:var(--secondary-text-color);line-height:1.4;';
        hint.textContent = hintText;
        left.appendChild(hint);
      }
      const pillLabel = document.createElement('label');
      pillLabel.style.cssText = 'position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!cfg[key];
      cb.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
      const track = document.createElement('span');
      const knob  = document.createElement('span');
      const sync = () => {
        track.style.cssText = 'position:absolute;inset:0;border-radius:11px;transition:background .2s;background:' +
          (cb.checked ? 'var(--primary-color,#03a9f4)' : 'var(--divider-color,rgba(0,0,0,.25))') + ';';
        knob.style.cssText  = 'position:absolute;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;' +
          'box-shadow:0 1px 3px rgba(0,0,0,.35);transition:left .2s;left:' + (cb.checked ? '21px' : '3px') + ';';
      };
      sync();
      cb.addEventListener('change', () => { sync(); this._set(key, cb.checked); });
      pillLabel.appendChild(cb);
      pillLabel.appendChild(track);
      pillLabel.appendChild(knob);
      wrap.appendChild(left);
      wrap.appendChild(pillLabel);
      return wrap;
    };

    const divider = () => {
      const d = document.createElement('div');
      d.className = 'divider';
      return d;
    };

    // ═══ Build sections ═══
    shell.appendChild(makeSection('general', '⚙️', 'General', [
      textField('inverter_name', 'Inverter Name', 'e.g. My Inverter'),
    ]));

    // ── Labels: global gate + per-row activation ──
    // Gate: section chip toggles _labels_custom_entities (body hidden when off).
    // Per-row: entity picker activates only when that row's label text differs from its default.
    const labelsEnabled = !!(cfg._labels_custom_entities);

    // Helper: entity picker that can be visually disabled
    const pickerMaybeDisabled = (key, label, disabled = false, optional = false) => {
      const wrap = picker(key, label, optional);
      if (disabled) {
        wrap.style.position = 'relative';
        const veil = document.createElement('div');
        veil.style.cssText = [
          'position:absolute', 'inset:0', 'border-radius:6px',
          'background:var(--secondary-background-color,rgba(0,0,0,.06))',
          'opacity:.55', 'pointer-events:all', 'cursor:not-allowed',
          'z-index:10',
        ].join(';');
        const note = document.createElement('div');
        note.style.cssText = [
          'position:absolute', 'inset:0', 'display:flex', 'align-items:center',
          'justify-content:center', 'font-size:.68rem', 'font-weight:600',
          'color:var(--secondary-text-color)', 'letter-spacing:.3px',
          'pointer-events:none', 'z-index:11',
        ].join(';');
        note.textContent = '⛔ Overridden by Labels section';
        wrap.appendChild(veil);
        wrap.appendChild(note);
      }
      return wrap;
    };

    // Per-row active: true when global gate is ON and label text ≠ default
    const _labelChanged = (key, def) => labelsEnabled && (cfg[key] || def) !== def;
    const cellTempActive   = _labelChanged('label_cell_temp_minmax', 'CELL TEMP MIN/MAX');
    const bmsTempActive    = _labelChanged('label_bms_temp',         'BMS TEMP');
    const minCellActive    = _labelChanged('label_min_cell',         'Min Cell');
    const maxCellActive    = _labelChanged('label_max_cell',         'Max Cell');
    const battDisActive    = _labelChanged('label_batt_dis',         'Batt Dis.');
    const totalPvGenActive = _labelChanged('label_total_pv_gen',     'TOTAL PV GEN.');

    // Label rows — text field + entity picker; picker active only when row is active
    const labelRow = (textKey, textLabel, textPlaceholder, entityKey, active = false) => {
      const frag = document.createDocumentFragment();
      frag.appendChild(textField(textKey, textLabel, textPlaceholder));
      const entityRow = document.createElement('div');
      entityRow.style.cssText = 'margin-top:-6px;margin-bottom:14px;';
      const entityLabel = document.createElement('div');
      entityLabel.style.cssText = 'font-size:.72rem;color:var(--secondary-text-color);padding:0 2px 3px;line-height:1;';
      entityLabel.textContent = active ? 'Entity (overrides default)' : 'Entity — change label to unlock';
      const sel = document.createElement('ha-selector');
      sel.hass = this._hass;
      sel.selector = { entity: {} };
      sel.value = cfg[entityKey] || '';
      sel._configKey = entityKey;
      sel.style.cssText = 'width:100%;display:block;';
      if (!active) {
        sel.style.opacity = '0.4';
        sel.style.pointerEvents = 'none';
        sel.title = 'Change the label text above to unlock this entity picker';
      }
      sel.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this._set(entityKey, ev.detail.value || '');
      });
      entityRow.appendChild(entityLabel);
      entityRow.appendChild(sel);
      const wrapper = document.createElement('div');
      wrapper.appendChild(frag);
      wrapper.appendChild(entityRow);
      return wrapper;
    };

    // Info banner
    const labelInfoBanner = (() => {
      const info = document.createElement('div');
      info.style.cssText = 'font-size:.72rem;line-height:1.5;color:var(--secondary-text-color);background:var(--secondary-background-color,rgba(0,0,0,.04));border:1px solid var(--divider-color,rgba(0,0,0,.10));border-radius:7px;padding:7px 10px;margin-bottom:10px;';
      info.innerHTML = '&#x1F4A1; <strong>Tip:</strong> Rename a tile label to unlock its entity override. The matching sensor in the Battery section will lock automatically to prevent duplication.';
      return info;
    })();

    shell.appendChild(makeSection('labels', '🏷️', 'Labels', [
      labelInfoBanner,
      labelRow('label_cell_temp_minmax', 'Cell Temp Min/Max label', 'CELL TEMP MIN/MAX', 'label_entity_cell_temp', cellTempActive),
      labelRow('label_bms_temp',         'BMS Temp label',          'BMS TEMP',          'label_entity_bms_temp',  bmsTempActive),
      labelRow('label_min_cell',         'Min Cell label',          'Min Cell',          'label_entity_min_cell',  minCellActive),
      labelRow('label_max_cell',         'Max Cell label',          'Max Cell',          'label_entity_max_cell',  maxCellActive),
      labelRow('label_batt_dis',         'Batt Dis label',          'Batt Dis.',         'label_entity_batt_dis',  battDisActive),
      labelRow('label_total_pv_gen',     'Total PV Gen label',      'TOTAL PV GEN.',     'total_pv_gen_entity',    totalPvGenActive),
    ], { toggleKey: '_labels_custom_entities', toggleOn: labelsEnabled, hidden: !labelsEnabled }));

    shell.appendChild(makeSection('solar', '☀️', 'Solar', [
      picker('pv1_power', 'PV1 Power'),
      picker('pv2_power', 'PV2 Power'),
    ]));

    shell.appendChild(makeSection('solar_extra', '☀️', 'Extra PV Strings', [
      picker('pv3_power', 'PV3 Power', true),
      picker('pv4_power', 'PV4 Power', true),
    ], { toggleKey: '_show_pv_extra', toggleOn: showPVExtra, hidden: !showPVExtra }));

    shell.appendChild(makeSection('solar_extras', '☀️', 'Solar Extras', [
      picker('pv_total_power',  'Total PV Power',  true),
      divider(),
      picker('inv_temp',        'Inverter Temp'),
      picker('today_pv',        'Today PV Gen'),
      picker('today_batt_chg',  'Today Batt Charge'),
      picker('today_load',      'Today Load'),
      picker('consump',         'House Consumption'),
      divider(),
      textField('label_total_pv_gen', 'Total PV Generation label', 'TOTAL PV GEN.'),
      pickerMaybeDisabled('total_pv_gen_entity', 'Total PV Generation', totalPvGenActive),
    ]));

    shell.appendChild(makeSection('grid', '🔌', 'Grid', [
      switchRow('invert_grid_power', '🔄 Invert grid power sign', 'Enable if positive = exporting (e.g. GoodWe active_power)'),
      divider(),
      picker('grid_active_power',  'Grid Active Power'),
      picker('grid_import_energy', 'Grid Import Energy'),
      picker('grid_export_energy', 'Grid Export Energy', true),
      picker('grid_power_alt',     'Alt Grid Sensor',    true),
    ]));

    shell.appendChild(makeSection('battery1', '🔋', 'Primary Battery', [
      switchRow('invert_battery_power', '🔄 Invert battery power sign', 'Enable if positive = discharging'),
      divider(),
      picker('battery_soc',      'Battery SOC'),
      picker('battery_power',    'Battery Power'),
      picker('battery_current',  'Battery Current'),
      picker('battery_voltage',  'Battery Voltage'),
      pickerMaybeDisabled('battery_temp1',    'Temp 1',             cellTempActive),
      pickerMaybeDisabled('battery_temp2',    'Temp 2',             cellTempActive),
      pickerMaybeDisabled('battery_mos',      'BMS Temp',           bmsTempActive),
      pickerMaybeDisabled('battery_min_cell', 'Min Cell Voltage',   minCellActive),
      pickerMaybeDisabled('battery_max_cell', 'Max Cell Voltage',   maxCellActive),
      pickerMaybeDisabled('batt_dis',         'Discharge Today',    battDisActive),
      divider(),
      picker('goodwe_battery_soc',  'Fallback SOC',     true),
      picker('goodwe_battery_curr', 'Fallback Current', true),
    ], { toggleKey: '_show_battery', toggleOn: showBatt1, hidden: !showBatt1 }));

    shell.appendChild(makeSection('battery2', '🔋', 'Secondary Battery', [
      switchRow('invert_battery_power', '🔄 Invert battery power sign', 'Shared with Primary'),
      divider(),
      picker('battery2_soc',      'SOC'),
      picker('battery2_power',    'Power'),
      picker('battery2_current',  'Current'),
      picker('battery2_voltage', 'Voltage'),
      pickerMaybeDisabled('battery2_mos',     'BMS Temp', bmsTempActive),
      divider(),
      numberField('battery2_full_wh', 'Battery 2 Capacity (if different from Batt 1)', 0, 50000, 1, 'Wh'),
    ], { toggleKey: '_show_battery2', toggleOn: showBatt2, hidden: !showBatt2 }));

    shell.appendChild(makeSection('limits', '⚙️', 'System Limits', [
      numberField('battery_full_ah',    'Battery Capacity',  0, 2000,  1,   'Ah'),
      numberField('battery_full_wh',    'Battery Capacity',  0, 50000, 1,   'Wh'),
      numberField('inverter_max_power', 'Inverter Max Power',1000,20000,100, 'W'),
      numberField('pv_max_power',       'PV Max Power',      1000,30000,100, 'W'),
    ], { toggleKey: '_show_limits', toggleOn: showLimits, hidden: !showLimits }));

    shell.appendChild(makeSection('ev', '🚗', 'EV / Car Charger', [
      picker('charger_state',           'Charger State'),
      picker('charger_power',           'Charger Power'),
      picker('charger_current',         'Charger Current'),
      picker('charger_soc',             'Car Battery SOC'),
      picker('charger_eta',             'Charge ETA (min)', true),
      numberField('charger_battery_capacity_wh', 'EV Battery Capacity', 0, 200000, 1, 'Wh'),
    ], { toggleKey: '_show_ev', toggleOn: showEV, hidden: !showEV }));

    this.innerHTML = '';
    this.appendChild(shell);
    this._rendered = true; // Fix #2: mark rendered so hass setter stops triggering full DOM rebuilds
  }
}
customElements.define('rdp-flow-card-editor', RdpFlowCardEditor);

// ═══════════════════════════════════════════════════════════════
// MAIN CARD
// ═══════════════════════════════════════════════════════════════
class RdpFlowCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this.config = {};
    this._prevPvTotal = -1;
    this._prevSunPos = { bx: -1, by: -1 };
    this._prevPvBlocksTotal = -1; // Fix #11: guard for pvBlocks rebuild
    this.attachShadow({ mode: 'open' });
  }

  static getStubConfig() {
    return {
      pv1_power: 'sensor.goodwe_pv1_power',
      pv2_power: 'sensor.goodwe_pv2_power',
      pv3_power: '',
      pv4_power: '',
      pv_total_power: 'sensor.goodwe_pv_power',
      grid_active_power: 'sensor.goodwe_active_power',
      grid_import_energy: 'sensor.goodwe_today_energy_import',
      grid_export_energy: '',
      consump: 'sensor.goodwe_house_consumption',
      today_pv: 'sensor.goodwe_today_s_pv_generation',
      today_batt_chg: 'sensor.goodwe_today_battery_charge',
      today_load: 'sensor.goodwe_today_load',
      battery_soc: 'sensor.jk_soc',
      battery_power: 'sensor.jk_power',
      battery_current: 'sensor.jk_current',
      battery_voltage: 'sensor.jk_voltage',
      battery_temp1: 'sensor.jk_temp1',
      battery_temp2: 'sensor.jk_temp2',
      battery_mos: 'sensor.jk_mos',
      battery_min_cell: 'sensor.jk_cellmin',
      battery_max_cell: 'sensor.jk_cellmax',
      goodwe_battery_soc: 'sensor.goodwe_battery_state_of_charge',
      goodwe_battery_curr: 'sensor.goodwe_battery_current',
      inv_temp: 'sensor.goodwe_inverter_temperature_module',
      batt_dis: 'sensor.goodwe_today_battery_discharge',
      battery2_soc: '',
      battery2_power: '',
      battery2_current: '',
      battery2_voltage: '',
      battery2_mos: '',
      battery_full_ah: 314,
      battery_full_wh: 16076,
      battery2_full_wh: '',   // Fix #14: optional separate capacity for battery 2
      inverter_max_power: 6000,
      pv_max_power: 7500,
      charger_state: '',
      charger_current: '',
      charger_power: '',
      charger_soc: '',
      charger_eta: '',
      charger_battery_capacity_wh: '',
      sun: 'sun.sun',
      inverter_name: '',
      label_cell_temp_minmax: 'CELL TEMP MIN/MAX',
      label_bms_temp: 'BMS TEMP',
      label_endurance: 'ENDURANCE',
      label_min_cell: 'Min Cell',
      label_max_cell: 'Max Cell',
      label_batt_dis: 'Batt Dis.',
      total_pv_gen_entity: 'sensor.goodwe_total_pv_generation',
      label_total_pv_gen: 'TOTAL PV GEN.',
      label_entity_cell_temp: '',
      label_entity_bms_temp: '',
      label_entity_min_cell: '',
      label_entity_max_cell: '',
      label_entity_batt_dis: '',
      _labels_custom_entities: false,
      grid_power_alt: 'sensor.grid_phase_a_power',
      _show_battery: true,
      _show_battery2: false,
      invert_battery_power: false,
      invert_grid_power: false,
      _show_pv_extra: false,   // combined toggle
      _show_ev: false,
      _show_limits: false,
    };
  }

  getCardSize() { return 8; }
  static getConfigElement() { return document.createElement('rdp-flow-card-editor'); }

  setConfig(config) {
    this.config = { ...RdpFlowCard.getStubConfig(), ...config };
    this._buildStaticSVG();
  }

  set hass(hass) { this._hass = hass; this._updateDynamic(); }

  _val(eid, toWatts = false) {
    if (!eid) return null;
    const s = this._hass?.states?.[eid];
    if (!s || s.state === 'unavailable' || s.state === 'unknown') return null;
    const v = parseFloat(s.state);
    if (isNaN(v)) return null;
    if (toWatts) {
      const unit = (s.attributes?.unit_of_measurement || '').trim();
      if (unit === 'kW' || unit === 'kilowatt') return v * 1000;
    }
    return v;
  }

  _strVal(eid) {
    if (!eid) return '';
    const s = this._hass?.states?.[eid];
    return s ? String(s.state).toLowerCase() : '';
  }

  _socColor(p) { return p<=25?'#f85149':p<=50?'#f39c4b':p<=75?'#58a6ff':'#4CAF50'; }
  _cellTempColor(t) { return t<=15?'#58a6ff':t<=35?'#3fb950':t<=45?'#f0883e':'#f85149'; }
  _cellVoltColor(v) { if(v<=0.001)return'#8b949e'; if(v<3.0)return'#f85149'; if(v<3.1)return'#f39c4b'; if(v<3.4)return'#f4d03f'; if(v<=3.65)return'#3fb950'; return'#f85149'; }
  _tempColor(t) { return t<=25?'#3fb950':t<=45?'#f0883e':'#f85149'; }
  _remCapColor(p) { return p<=15?'#e34d4c':p<=30?'#f39c4b':p<=55?'#f4d03f':'#2ecc71'; }
  _fmtTime(h) { if(!isFinite(h)||h<=0) return'--';const hh=Math.floor(h),mm=Math.round((h-hh)*60);return hh+'h '+(mm<10?'0':'')+mm+'m'; }
  _fmtEndurance(h) {
    if (!isFinite(h) || h <= 0) return '--';
    const days = Math.floor(h / 24), hrs = Math.floor(h % 24), mins = Math.floor((h - Math.floor(h)) * 60);
    if (days > 0) return days + 'd ' + hrs + 'h';
    return hrs + 'h ' + (mins < 10 ? '0' : '') + mins + 'm';
  }
  _fmtTill(h) {
    // Fix #15: h > 0 guard was too strict — h approaching 0 from positive side
    // (battery at 0%, tiny charge power) returned 'Till --' despite a valid ETA.
    // Use h < 0 to reject only truly invalid/negative values.
    if (!isFinite(h) || h < 0) return 'Till --';
    const target = new Date(Date.now() + h * 3600000);
    const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][target.getDay()];
    let hr = target.getHours(); const ampm = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    return 'Till ' + day + ' ' + hr + ':' + target.getMinutes().toString().padStart(2,'0') + ' ' + ampm;
  }

  _sunData() {
    const attrs = this._hass?.states[this.config.sun || 'sun.sun']?.attributes;
    // Sun position uses time-based t derived from today's ACTUAL rise/set times.
    // next_rising/next_setting flip to tomorrow after sunrise — we correct for this
    // by subtracting one day when the event is more than 18 h in the future.
    // elevation is used only for night detection and bell (arc height) — it is a
    // live real-time value and is never affected by the tomorrow-flip problem.
    let rise = '06:00', set = '18:00';
    let t = 0.5;
    let night = false;
    let bell = 0.5;

    // Return the nearest occurrence of an HA future-only timestamp.
    // If the event is more than 18 h away it must be tomorrow's — use yesterday's copy.
    const nearestTime = iso => {
      if (!iso) return null;
      try {
        const future = new Date(iso);
        if ((future - Date.now()) > 18 * 3600000) {
          future.setDate(future.getDate() - 1);
        }
        return String(future.getHours()).padStart(2, '0') + ':' + String(future.getMinutes()).padStart(2, '0');
      } catch (e) { return null; }
    };

    if (attrs) {
      // Get today's actual rise / set for display labels AND position math
      rise = nearestTime(attrs.next_rising)  || rise;
      set  = nearestTime(attrs.next_setting) || set;

      const toMin = s => { const p = s.split(':').map(Number); return p[0] * 60 + p[1]; };
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const RISE = toMin(rise), SET = toMin(set);
      const dayLen = SET - RISE;

      // t: 0 = sunrise, 1 = sunset, clamped to [0,1]
      t = dayLen > 0 ? Math.max(0, Math.min(1, (nowMin - RISE) / dayLen)) : 0.5;

      // Night detection: prefer live elevation when available
      if (attrs.elevation != null) {
        night = parseFloat(attrs.elevation) < 0;
        // bell: how high the sun is (0 at horizon, 1 at max elevation)
        bell = Math.max(0, Math.sin(Math.max(0, parseFloat(attrs.elevation)) * Math.PI / 180));
      } else {
        night = nowMin < RISE || nowMin > SET;
        bell  = 1 - Math.pow(Math.abs(2 * t - 1), 1.5);
      }
    }

    // Sun position on the quadratic Bézier arc: left(35,78) → top(260,-45) → right(485,78)
    const bx = Math.round((1 - t) * (1 - t) * 35  + 2 * (1 - t) * t * 260 + t * t * 485);
    const by = Math.round((1 - t) * (1 - t) * 78  + 2 * (1 - t) * t * (-45) + t * t * 78);

    // Moon position: travels its own arc from right to left during night hours.
    // Uses an independent tMoon computed from elapsed night time — NOT (1-t),
    // which was wrong because t itself is re-mapped during night.
    let mx = 260, my = 72;
    if (night) {
      const toMin2 = s => { const p = s.split(':').map(Number); return p[0] * 60 + p[1]; };
      const RISE2 = toMin2(rise), SET2 = toMin2(set);
      const nowMin2 = new Date().getHours() * 60 + new Date().getMinutes();
      const nightLen = 1440 - (SET2 - RISE2);
      // tMoon: 0 = just after sunset, 1 = just before sunrise
      let tMoon = nowMin2 > SET2
        ? (nowMin2 - SET2) / nightLen
        : (nowMin2 + 1440 - SET2) / nightLen;
      tMoon = Math.max(0, Math.min(1, tMoon));
      // Moon arc: right(485,78) → bottom-mid(260,158) → left(35,78)
      mx = Math.round((1 - tMoon) * (1 - tMoon) * 485 + 2 * (1 - tMoon) * tMoon * 260 + tMoon * tMoon * 35);
      my = Math.round((1 - tMoon) * (1 - tMoon) * 78  + 2 * (1 - tMoon) * tMoon * 158  + tMoon * tMoon * 78);
    }
    return { rise, set, night, bell, bx, by, mx, my, t };
  }

  _battFill(soc){
    const ft=145,fb=263,fh=118;const fH=Math.round((soc||0)/100*fh),fY=fb-fH;let c,f,tc;
    if(soc<=20){c='#ff2200';f='url(#battGlowRed)';tc='#000';}else if(soc<=40){c='#f4d03f';f='url(#battGlowOrange)';tc='#000';}else if(soc<=75){c='#44ff00';f='url(#battGlowGreen)';tc='#fff';}else{c='#00d4ff';f='url(#battGlowCyan)';tc='#fff';}
    return{y:fY,height:fH,color:c,filter:fH>4?f:'none',textColor:tc};
  }

  _flowLevel(w,type){
    if(type==='solar'){if(w<200)return{dur:4,size:1.8,count:6};if(w<600)return{dur:3.2,size:2.2,count:12};if(w<1200)return{dur:2.7,size:2.5,count:20};if(w<2500)return{dur:2.4,size:2.8,count:30};if(w<4000)return{dur:1.8,size:3.2,count:42};if(w<6000)return{dur:1.2,size:3.5,count:55};return{dur:.9,size:3.8,count:65};}
    if(w<150)return{dur:4,size:1.8,count:4};if(w<500)return{dur:3.2,size:2.2,count:8};if(w<1000)return{dur:2.7,size:2.5,count:14};if(w<2000)return{dur:2.4,size:2.8,count:22};if(w<3000)return{dur:1.8,size:3.2,count:30};if(w<4500)return{dur:1.5,size:3.5,count:40};return{dur:.9,size:3.8,count:50};
  }

  _buildPvWaveHTML(bx,by,pvT){
    if(pvT<=10)return'';const fl=this._flowLevel(pvT,'solar');const sY=by+7;const pD='M '+bx.toFixed(1)+','+sY.toFixed(1)+' C '+bx.toFixed(1)+',85 260,5 260,155';const col='rgba(255,232,60,.95)',gc='rgba(255,190,20,.55)';const dD=(fl.dur*.8).toFixed(2),dL=(8+fl.size*1.5).toFixed(1),gL=(6+fl.size*1.2).toFixed(1),dT=(parseFloat(dL)+parseFloat(gL)).toFixed(1);let h='';h+='<path d="'+pD+'" fill="none" stroke="'+gc+'" stroke-width="6" stroke-dasharray="'+dL+' '+gL+'" stroke-linecap="round" opacity="0.25" filter="url(#arcSunF2)"><animate attributeName="stroke-dashoffset" from="'+dT+'" to="0" dur="'+dD+'s" repeatCount="indefinite" calcMode="linear"/></path>';h+='<path d="'+pD+'" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.8" stroke-dasharray="'+dL+' '+gL+'" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="'+dT+'" to="0" dur="'+dD+'s" repeatCount="indefinite" calcMode="linear"/></path>';h+='<path d="'+pD+'" fill="none" stroke="'+col+'" stroke-width="1.0" stroke-dasharray="'+dL+' '+gL+'" stroke-linecap="round" opacity="0.85"><animate attributeName="stroke-dashoffset" from="'+dT+'" to="0" dur="'+dD+'s" repeatCount="indefinite" calcMode="linear"/></path>';const wD=[{amp:6,dur:fl.dur*.9,ox:0,op:.9,sc:'rgba(255,255,255,0.92)',dLen:'3.0',dGap:'40.0'},{amp:10,dur:fl.dur*1.1,ox:3,op:.6,sc:col,dLen:'4.5',dGap:'50.0'}];const wc=Math.min(2,Math.max(1,Math.round(fl.count/5)));for(let wi=0;wi<wc;wi++){const w=wD[wi];const sC=Math.round(fl.count*.5),sD=w.dur.toFixed(2),sCy=(parseFloat(w.dLen)+parseFloat(w.dGap)).toFixed(1);for(let si=0;si<sC;si++){const fr=si/sC,ph=fr*Math.PI*2,sY2=(w.amp*Math.sin(ph+wi*1.1)).toFixed(1),sX=(w.ox+w.amp*.3*Math.cos(ph*.5)).toFixed(1),sDe=(fr*w.dur%w.dur).toFixed(3),sO=(w.op*(.5+.5*Math.abs(Math.sin(ph)))*.6).toFixed(2);h+='<g transform="translate('+sX+','+sY2+')"><path d="'+pD+'" fill="none" stroke="'+w.sc+'" stroke-width="1.2" stroke-dasharray="'+w.dLen+' '+w.dGap+'" stroke-linecap="round" opacity="'+sO+'"><animate attributeName="stroke-dashoffset" from="'+sCy+'" to="0" dur="'+sD+'s" begin="-'+sDe+'s" repeatCount="indefinite" calcMode="linear"/></path></g>';}}return h;
  }

  _buildStaticSVG() {
    const dual = !!(this.config._show_battery2);
    const showBatt1 = !!(this.config._show_battery !== false);
    const ev   = !!(this.config._show_ev);
    const showPvExtra = !!(this.config._show_pv_extra);
    // iconPath removed - icons embedded as base64    // icons served from HACS community folder

    const pv3txt = showPvExtra ? `<text id="pv3label" x="8" y="424" font-size="9" fill="#8b949e" letter-spacing="1">PV3</text><text id="pv3FlowVal" x="8" y="438" font-size="12" font-weight="700" fill="#ffe83c">-- W</text>` : '';
    const pv4txt = showPvExtra ? `<text id="pv4label" x="8" y="456" font-size="9" fill="#8b949e" letter-spacing="1">PV4</text><text id="pv4FlowVal" x="8" y="470" font-size="12" font-weight="700" fill="#ffe83c">-- W</text>` : '';

    // EV placement inline with home and grid
    const evX = 462 - 39.5;   // centre of grid icon
    const evY = 397 - 39.5;   // centre of home icon
    const evtxt = ev ? `<g id="evGroup">
      <path id="flowHomeEV" d="M 317,397 H ${evX}" fill="none" stroke="#2b59ff" stroke-width="3" stroke-linecap="round" stroke-dasharray="8 6" opacity="0">
        <animate attributeName="stroke-dashoffset" from="-14" to="0" dur="0.8s" repeatCount="indefinite"/>
      </path>
      <image id="evIconImg" href="data:image/png;base64,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" x="${evX}" y="${evY}" width="79" height="79" preserveAspectRatio="xMidYMid meet"/>
      <text id="evPowerVal" x="${evX+39.5}" y="${evY+98}" text-anchor="middle" font-size="10" font-weight="600" fill="#29c4f6">-- W</text>
      <text id="evCurrentVal" x="${evX+39.5}" y="${evY+110}" text-anchor="middle" font-size="9" fill="#cde">-- A</text>
      <text id="evSocVal" x="${evX+39.5}" y="${evY+122}" text-anchor="middle" font-size="9" fill="#fff">-- %</text>
      <text id="evEtaVal" x="${evX+39.5}" y="${evY+134}" text-anchor="middle" font-size="10" font-weight="600" fill="#4ade80">--</text>
    </g>` : '';

    // Battery current/power placed OUTSIDE the transformed group, above/below the flow bar (center y=175)
    const battTextSingle = `
      <text id="battPwrFlow" x="75" y="165" font-size="10" font-weight="600" fill="#cde">-- W</text>
      <text id="battCurrFlow" x="75" y="196" font-size="10" font-weight="600" fill="#fff">-- A</text>
    `;
    const battTextDual = `
      <text id="battPwrFlow1" x="75" y="158" font-size="10" font-weight="600" fill="#cde">-- W</text>
      <text id="battPwrFlow2" x="75" y="171" font-size="10" font-weight="600" fill="#cde">-- W</text>
      <text id="battCurrFlow1" x="75" y="196" font-size="10" font-weight="600" fill="#fff">-- A</text>
      <text id="battCurrFlow2" x="75" y="209" font-size="10" font-weight="600" fill="#fff">-- A</text>
    `;

    const batteryTip = `<rect x="75" y="126" width="18" height="4" rx="2" fill="url(#battCapGrad)"/>`;

    // Battery visibility helpers – mirror EV charger pattern
    const battGhostPath = showBatt1
      ? `<path d="M 59,175 H 132 V 205 H 205" fill="none" stroke="#1e3a5f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.18"/>`
      : '';
    const battFlowPaths = showBatt1 ? `
      <path id="flowBattIn" d="M 59,175 H 132 V 205 H 205" fill="none" stroke="#8b949e" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" opacity="0" style="display:none"><animate attributeName="stroke-dashoffset" from="-24" to="0" dur="4.0s" repeatCount="indefinite"/></path>
      <path id="flowBattOut" d="M 59,175 H 132 V 205 H 205" fill="none" stroke="#8b949e" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" opacity="0" style="display:none"><animate attributeName="stroke-dashoffset" from="0" to="-24" dur="4.0s" repeatCount="indefinite"/></path>` : '';
    const battIconSection = !showBatt1 ? '' : (
      `<g transform="translate(-36.6, 25.4) scale(0.8)">
        <g id="battIconWrap">
          <rect x="49" y="135" width="70" height="132" rx="10" fill="url(#battShellGrad)"/>
          ${batteryTip}
          <rect x="51" y="258" width="66" height="9" rx="4" fill="url(#battCapGrad)"/>
          <rect x="51" y="137" width="66" height="7" rx="4" fill="url(#battCapGrad)"/>
          <rect x="49" y="135" width="70" height="132" rx="10" fill="url(#battGlassBody)" style="pointer-events:none"/>
          <rect x="53" y="145" width="62" height="118" rx="8" fill="#0f1214"/>` +
      (dual ? `
            <rect id="battFillBar1" x="53" y="263" width="30" height="0" rx="0" fill="#3fb950" clip-path="url(#battBodyClipLeft)"/>
            <rect id="battFillHL1" x="53" y="263" width="30" height="0" rx="0" fill="url(#battFillHighlight)" clip-path="url(#battBodyClipLeft)" style="pointer-events:none"/>
            <rect id="battFillBar2" x="85" y="263" width="30" height="0" rx="0" fill="#3fb950" clip-path="url(#battBodyClipRight)"/>
            <rect id="battFillHL2" x="85" y="263" width="30" height="0" rx="0" fill="url(#battFillHighlight)" clip-path="url(#battBodyClipRight)" style="pointer-events:none"/>
            <g id="battBoltGroup1" opacity="0"><polygon points="72,176 64,195 70,195 66,215 78,193 72,193 80,176" fill="#1a4aff" stroke="rgba(100,150,255,.5)" stroke-width="0.8" filter="url(#battGlowBolt)"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.0s" repeatCount="indefinite"/></polygon></g>
            <g id="battBoltGroup2" opacity="0"><polygon points="104,176 96,195 102,195 98,215 110,193 104,193 112,176" fill="#1a4aff" stroke="rgba(100,150,255,.5)" stroke-width="0.8" filter="url(#battGlowBolt)"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.0s" repeatCount="indefinite"/></polygon></g>
            <text id="fcBattVal1" x="68" y="208" text-anchor="middle" font-size="14" font-weight="900" fill="#fff">--%</text>
            <text id="fcBattVal2" x="100" y="208" text-anchor="middle" font-size="14" font-weight="900" fill="#fff">--%</text>
            <text id="battVoltageFlow1" x="68" y="278" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">-- V</text>
            <text id="battVoltageFlow2" x="100" y="278" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">-- V</text>
          ` : `
            <rect id="battFillBar" x="53" y="263" width="62" height="0" rx="0" fill="#3fb950" clip-path="url(#battBodyClip)"/>
            <rect id="battFillHL" x="53" y="263" width="62" height="0" rx="0" fill="url(#battFillHighlight)" clip-path="url(#battBodyClip)" style="pointer-events:none"/>
            <g id="battBoltGroup" opacity="0"><polygon points="86,176 74,199 82,199 77,223 93,195 85,195 97,176" fill="#1a4aff" stroke="rgba(100,150,255,.5)" stroke-width="0.8" filter="url(#battGlowBolt)"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.0s" repeatCount="indefinite"/></polygon></g>
            <text id="fcBattVal" x="84" y="211" text-anchor="middle" font-size="18" font-weight="900" fill="#fff">--%</text>
            <text id="battVoltageFlow" x="84" y="285" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">-- V</text>
          `) +
      `</g>
      </g>`
    );

    this.shadowRoot.innerHTML = `<style>
      :host{display:block} @keyframes svgPulseOrange{0%,100%{filter:drop-shadow(0 0 5px #f39c4b)}50%{filter:drop-shadow(0 0 8px #f39c4bff)}}
      .st{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:7px 9px}
      .st .l{font-size:.48rem;color:#8b949e;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px}
      .st .v{font-size:.8rem;font-weight:600;color:#c9d1d9}
      .dv{height:1px;background:#21262d;margin:8px 0}
      .ct{font-size:.56rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8b949e;margin-bottom:10px;display:flex;align-items:center;gap:7px}
      .ct::after{content:'';flex:1;height:1px;background:#21262d}
      .pvf{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:2px}
      .pvi{text-align:center;background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:6px 2px}
      .pvi .ico{font-size:.95rem;margin-bottom:2px}
      .pvi .lbl{font-size:.44rem;color:#8b949e;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px}
      .pvi .val{font-size:.76rem;font-weight:700;color:#c9d1d9}
      .pvi .val.yw{color:#f4d03f} text{font-family:'Segoe UI',Arial,sans-serif}
    </style>
    <div style="background:#161b22;border:1px solid #21262d;border-radius:12px;padding:13px;box-shadow:0 4px 20px rgba(0,0,0,.4);width:100%;box-sizing:border-box;">
      <div class="ct">⚡ Energy Flow <span id="battStatusBadge" style="margin-left:auto;font-size:.5rem;font-weight:700;letter-spacing:1.5px;padding:1px 8px;border-radius:8px;background:#21262d;color:#8b949e;text-transform:uppercase">IDLE</span></div>
      <div style="width:100%;max-width:520px;margin:0 auto"><svg id="flowSvg" viewBox="0 0 520 470" style="width:100%;display:block">
      <defs>
        <filter id="arcSunF" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="7"/></filter>
        <filter id="arcSunF2" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3"/></filter>
        <filter id="moonF"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <radialGradient id="dynAuraG" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="rgba(30,100,200,.28)"/><stop offset="55%" stop-color="rgba(30,80,160,.10)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
        <radialGradient id="sunCG" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="rgba(255,255,220,.98)"/><stop offset="40%" stop-color="rgb(255,125,10)"/><stop offset="100%" stop-color="rgba(255,130,10,.6)"/></radialGradient>
        <linearGradient id="arcDayGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgba(255,180,50,0)"/><stop offset="20%" stop-color="rgba(255,200,70,.5)"/><stop offset="50%" stop-color="rgba(255,228,110,.92)"/><stop offset="80%" stop-color="rgba(255,200,70,.5)"/><stop offset="100%" stop-color="rgba(255,180,50,0)"/></linearGradient>
        <linearGradient id="arcNightGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgba(140,170,255,0)"/><stop offset="30%" stop-color="rgba(155,185,255,.35)"/><stop offset="50%" stop-color="rgba(200,215,255,.7)"/><stop offset="70%" stop-color="rgba(155,185,255,.35)"/><stop offset="100%" stop-color="rgba(140,170,255,0)"/></linearGradient>
        <linearGradient id="battCapGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2d2d2d"/><stop offset="18%" stop-color="#8f8f8f"/><stop offset="50%" stop-color="#ececec"/><stop offset="82%" stop-color="#7a7a7a"/><stop offset="100%" stop-color="#242424"/></linearGradient>
        <linearGradient id="battShellGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#050505"/><stop offset="18%" stop-color="#111"/><stop offset="50%" stop-color="#080808"/><stop offset="82%" stop-color="#111"/><stop offset="100%" stop-color="#030303"/></linearGradient>
        <linearGradient id="battGlassBody" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgba(255,255,255,0.03)"/><stop offset="15%" stop-color="rgba(255,255,255,0.22)"/><stop offset="33%" stop-color="rgba(255,255,255,0.05)"/><stop offset="50%" stop-color="rgba(255,255,255,0)"/><stop offset="67%" stop-color="rgba(255,255,255,0.05)"/><stop offset="85%" stop-color="rgba(255,255,255,0.18)"/><stop offset="100%" stop-color="rgba(255,255,255,0.03)"/></linearGradient>
        <linearGradient id="battFillHighlight" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgba(255,255,255,0.02)"/><stop offset="20%" stop-color="rgba(255,255,255,0.22)"/><stop offset="48%" stop-color="rgba(255,255,255,0.44)"/><stop offset="60%" stop-color="rgba(255,255,255,0.12)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></linearGradient>
        ${dual?`<clipPath id="battBodyClipLeft"><rect x="53" y="145" width="30" height="118" rx="6"/></clipPath><clipPath id="battBodyClipRight"><rect x="85" y="145" width="30" height="118" rx="6"/></clipPath>`:`<clipPath id="battBodyClip"><rect x="53" y="145" width="62" height="118" rx="8"/></clipPath>`}
        <filter id="battGlowRed"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="battGlowOrange"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="battGlowGreen"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="battGlowCyan"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="battGlowBolt"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="iconGlowOrange" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feFlood flood-color="rgba(255,140,0,0.6)" result="c"/><feComposite in="c" in2="b" operator="in" result="d"/><feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="iconGlowBlue" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feFlood flood-color="rgba(30,144,255,0.6)" result="c"/><feComposite in="c" in2="b" operator="in" result="d"/><feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="iconGlowGreen" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feFlood flood-color="rgba(46,204,113,0.6)" result="c"/><feComposite in="c" in2="b" operator="in" result="d"/><feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="iconGlowYellow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feFlood flood-color="rgba(255,230,0,0.7)" result="c"/><feComposite in="c" in2="b" operator="in" result="d"/><feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ellipse id="skyAura" cx="260" cy="84" rx="230" ry="110" fill="url(#dynAuraG)"/>
      <path d="M 35,78 Q 260,-45 485,78 Z" fill="rgba(30,100,200,.05)"/>
      <line x1="8" y1="78" x2="512" y2="78" stroke="rgba(255,255,255,.12)" stroke-width="1" stroke-dasharray="3,8"/>
      <circle cx="35" cy="78" r="3.5" fill="rgba(255,200,80,.7)"/>
      <circle cx="260" cy="78" r="2.5" fill="rgba(255,255,255,.25)"/>
      <circle cx="485" cy="78" r="3.5" fill="rgba(255,110,55,.7)"/>
      <text id="arcRiseLabel" x="35" y="92" fill="rgba(255,255,255,.5)" font-size="10" text-anchor="middle">06:00</text>
      <text x="260" y="92" fill="rgba(255,255,255,.28)" font-size="10" text-anchor="middle">12:00</text>
      <text id="arcSetLabel" x="485" y="92" fill="rgba(255,255,255,.5)" font-size="10" text-anchor="middle">18:00</text>
      <path d="M 35,78 Q 260,-45 485,78" fill="none" stroke="url(#arcDayGrad)" stroke-width="2.2"/>
      <path d="M 485,78 Q 260,158 35,78" fill="none" stroke="url(#arcNightGrad)" stroke-width="1.5" stroke-dasharray="4,5" opacity=".35"/>
      <g id="arcSunGroup" opacity="1">
        <circle id="arcSunGlow2" cx="260" cy="35" r="28" fill="rgba(255,200,60,.12)" filter="url(#arcSunF)"><animate attributeName="r" values="28;34;28" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.55;0.9;0.55" dur="2.2s" repeatCount="indefinite"/></circle>
        <circle id="arcSunGlow1" cx="260" cy="35" r="14" fill="rgba(255,200,60,.5)" filter="url(#arcSunF2)"><animate attributeName="r" values="14;17;14" dur="2.2s" repeatCount="indefinite"/></circle>
        <circle id="arcSunDot" cx="260" cy="35" r="7" fill="url(#sunCG)" stroke="rgba(255,255,200,.85)" stroke-width="1.2"><animate attributeName="r" values="7;8;7" dur="2.2s" repeatCount="indefinite"/></circle>
      </g>
      <g id="moonGroup" opacity="0" filter="url(#moonF)">
        <circle id="moonGlow" cx="260" cy="72" r="12" fill="rgba(180,205,255,.18)"/>
        <circle id="moonDot" cx="260" cy="72" r="6" fill="rgba(220,235,255,.92)" stroke="rgba(240,248,255,.9)" stroke-width="1.2"/>
      </g>
      <rect id="arcPvLabelRect" x="162" y="22" width="96" height="26" rx="13" fill="rgba(255,200,50,.22)" stroke="rgba(255,210,60,.5)" stroke-width="1.2"/>
      <text id="arcPvLabelText" x="210" y="39" text-anchor="middle" fill="rgba(255,235,110,.98)" font-size="13" font-weight="800">0 W ⚡</text>
      <g id="pvFlowGroup"></g>

      ${battGhostPath}
      <path d="M 399,175 H 361 V 202 H 315" fill="none" stroke="#1e3a5f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.18"/>
      <path d="M 260,265 V 358" fill="none" stroke="#1e3a5f" stroke-width="3" stroke-linecap="round" opacity="0.18"/>

      <path id="flowGridIn" d="M 432,175 H 361 V 202 H 315" fill="none" stroke="#FF2929" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" opacity="0" style="display:none"><animate attributeName="stroke-dashoffset" from="0" to="-24" dur="0.8s" repeatCount="indefinite"/></path>
      <path id="flowGridOut" d="M 432,175 H 361 V 202 H 315" fill="none" stroke="#2ecc71" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" opacity="0" style="display:none"><animate attributeName="stroke-dashoffset" from="-24" to="0" dur="0.8s" repeatCount="indefinite"/></path>

      ${battFlowPaths}

      <path id="flowInvLoad" d="M 260,358 V 265" fill="none" stroke="#29c4f6" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" opacity="0" style="display:none"><animate attributeName="stroke-dashoffset" from="-24" to="0" dur="0.8s" repeatCount="indefinite"/></path>

      <!-- Battery current/power placed above/below flow bar -->
      ${showBatt1 ? (dual ? battTextDual : battTextSingle) : ''}

      ${battIconSection}

      <g id="gridIconImg" transform="translate(399,133)" style="opacity:1"><image href="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAD6APoDASIAAhEBAxEB/8QAHQABAAIDAQEBAQAAAAAAAAAAAAUGAwQHAggBCf/EAEkQAAEDAwIDBQUDCQYFAgcAAAECAwQABRESIQYxQQcTIlFhFDJxgZFSobEIIzNCYnLB0fAVNENTouEWJESCkmPCF1VzhJSy8f/EABgBAQEBAQEAAAAAAAAAAAAAAAABAgME/8QAKBEBAQACAQMEAAYDAAAAAAAAAAECEQMEITESE0FRFCJCUmGRBTKB/9oADAMBAAIRAxEAPwD4ypWR9l1h0tPNqbWOaVDBrHQKUpQKUpQem1rbWFtqKVJOQQcEVMWq+OxXVKJCCsYcKUgocHktHI/EYNQtKCwS7fAnp76GtuG6o+4VZZWfJKv1T6KqFmRZEN4symVtODoofePOvLD7rCippZTkYI6EeRHWpmFeEORxEmNtOMdG3clA/dV7yD8Mj0oIKlTcmyokHVanFLURn2Z0jvP+0jZwfDf0qGWhTayhaVJUk4IIwQaDzX6klKgpJIIOQR0r8pQSCnWrj/eFJal9HTsl397yPr16+daTzTjLhbdQULTzBrxVm4CtX/E97YsclRDSkqKXR7ze2wz5ZxsaCs0qZ4wsEnhy9v2yQsOFpWnWnlnAOPiM1DUClKUClKUClKUClKUClKUClKUClKUEm1NYdR3byA2nokgqb+Q95PyPyr8kQGyjvWVhtJ5FStSD6BY5fBWKjayMPusL1NOKQTscdfj50B9h1hWl1tSCeWeR+B61jqRjz0Y0OoCEnnpTqQfig7fMYr25BYfQXGFpRjmUkqR8/wBZPzHzoIulZX47zGC4jCT7qgcpPwI2rFQKUpQKUpQZ40p1gaUkKRnJQrcZ8/Q+oqZanxLklLNxQXVckrKgl5PwWdlD0V9ar9KCXnWKQ2hb8JXtjCN16UkONj9tHMfHcetRFb0C5yojiFJcUQj3CFEKR+6obj8KmHHrVekfn0dzLP8AjtICVn99A8K/inB9DQVmuw/k9R2Y65E4x2nZb2vuSteNKW0EkYznCicZ6aelcrn2yTEwrwvMqOlDzR1JJ8vMH0ODXZeDGF2q0SocyKy25Etj6mHXCnUkEJC0pSAVElRKiSDsQPSgq3bSjRxY7PWw97LMUW3krH+IjbUk/AjH+9c7ksllYGQtChlCxyUPOuwdsCpN34ffWYq0tW91LjLyRlDidkL36YJTtt12GK5rw/Z7tcyI7FrlyYyzutKMBs/aCjsPmd6CEqY4TiNTJktDqAsIgSXU5HJSW1EH6irJaeziTIXqlXJlLWVYVGQXU7Z95zZCeXVWfSr1w5wBa2bVKFsiypNxdjOtB/ve8SUKSpKikDSORG+/zom3CaVL8R2J6zupJcS6y57ihsR6KHQ1EUUpSlApSlApSlApSlApSlApX6tKkKKVpKVDYgjBFflAr02tbawttakKHIpOCK80oN9i4kZD6M6veUgAE/EclfMZ9ayqjRZQKmDpVzPdgkfNHMfLIqLr9SSkgpJBHIigzPxXmU6ykKbzgLQcp+vT51grej3J1CsujvOhUDhePU9fmDWx3UGbu0oNuHokaT/48j/2n5UETStqTBfYCladaE81J6fEcx861aBSlKBSlbFvhybhMbhw2VPPunCUJ6/7etBZezmRMlcUQ2DE9vCCXFIKtJUlAzhSuRTkAeLPyrt8W3xo8yXdH221x3m0ttxykHSnVukn9ZJIyCB0NUns+tyLHKXEiRmZqVsKTMmKxoLmEqQlskjYZxtz5+VWtTbpuiVtJZcuK20B5pJyWUBXg0gj6KIFGbVilJYVMTJdcjx47iXWFNYwpJPIhPI52O+/PB6VT1w7b7U+7NZN3lMhXeLe3ainSNlJKsJ5/d8qlXYiY3doekL9tLoU2pKyt5xI5Agfq/yqgcUdp7kO8ym7QwvZSW1B1CUhJT72AM5UTnxEmjGNtWG5uyrVCh3Gbcbcm2uKWO4SkNt9wcgANkbnGMYAHPJqAvHaTcE2uRauFx/ZkdbPh0gZebIGpKSOWNI8O52OfKqLdbnIuwW9cJTs1ha9YdXu7HUfP0+442wajkFcQpaeUSwo62nUb6T9pP8AEUbkdR7P7Rau0ng652h0tscTxUJciODYPhIVgEcsnOMjqPWuRy470WU7GkNqbeaWULQoYKSDgip2x3Wdw7fo99tq9EhhQU4lB8K0nqP2T9xqzdtlw4Z4kmwuKOHytEuYyFXJnu9KUODbVnzPXHpWu1id5l/Dm9KUrLZSlKBSlKBSlKBSlKCypvMG4JCLkwhxXLU4MKHwWkZ+o+dYpFijPI7y3zAkHkh4jB9AsbH4VX6yMPvMK1MurbPXScZoMs6BMhL0yo7jfkSNj8DyrWqag399pPdvp1tnmEgYPxSdvpitnu7HcvcHsrx/ytv9B/8AaTQVylS8uwTGgpcZSJaBz7v3h8UncVErSpCilSSlQ5gjBFB+UpSg3I1wkNaQo96lOw1E5HwI3H4VtD+zZ3NXs7p6nA+/3T/pqJpQWE8G31VtNxYi9/G/UKN1LG+4HXkar6klKilQII5gjlVp4E4pm2Z/2dLylNKyGgpRIbJ2OBnAyD+FTFy4wR7T7NxHYIF1aIyh4o0uKT0OoeLPzqxLaqECzS7iqCxbmXJMqWtaEtJT5Eb/AA3+6ulcN8GptUN7255SGX0hh1xlX5x0qIyAf1UY+Zznyqd4If4X9kLlgZUEOMK0xVuBbrZI8aTjx4zkgbjHWqlxL2mkKdjWOEG/GlRkPElRUlITkD4AYzUsSZbdRkOQ7dBcg977M2gnuEN4GBgbqTjCTnO+c7CtRuExBuTVwglSZUpkFxC0lLa1DASnxciTzO3Q1yvstuE2bxe9cJklTns0VbqlOKwhI1JHwTzxnHWul26TiSubfGXFB0Ly68SXDpUMBOnKcjkCN8c+VGbEjCCHZC3pb3dq1qUEpUMYCORxsSMnz3HXbHztxS2lniW5tIUVJRLdAJ5kajX0c1EQJ6ZSJAD7JdKGorhBdRtp1jPQ538+tfOfFmo8T3MrCgoynMhXMHUedFxR7DrjLgcaUUq/EeR86kobrMhJaShA1nKoylYSo+aD+qr0/HlUTSjaXDZj7BS1xwSAoo8bBPMLT5eY5HpRtSoD/fJaS7HOC6zqykjzB8j5/I1YuAbiIzCrpItT10fhyGkIDZOstrSvUk4HjHhGxq+r4a4I4kaccgrfsEwgq7l5OhKFfa0q6Hrvg1ZNsZZzHy5PxZEgGWiZaIyosV6O28I5WVFsEYJyeYyD8Kgau3aFaptplWwJZSQxDCNSAdK06lYUAd9KhVQlNoADzP6JfIfZPVJqNS7YKUpRSlKUClKUClKUG/JtExk+FHejzRnP0O/3VoqBSSFAgjmDWaPLkx/0Lykj7PMfQ7VvC7IfATPiNvDlqGx/r4YoIqlS3slslDMWX3Kz+o5t+P8AM1gk2mazv3XeDzRv93P7qDzEucyMRpd1pTyC98fA8x8jUs1eoExIbukRK+mtQyR8FDcffVdIIOCMEV+UFjfsMKS2XrZNGn7LpyB/3Dl86h51umwj/wAxHWlPRY3SfmNq12XXWXA4y4ttY5KScGpeDxFLZ8L6UvIPP9Un+B+YoIWlWMmwXLmPZHj9nwfcfD99asvh+UjeK4iSnmAPCrHwNBDVYYTrN5giDJWESW92lnqf65/X4QLzTjKyh1tTah0UMGvKFKQoKQopUDkEcxQSVrmXDhriBicykNy4jmpIWnKT/MEVe+KrdZeOIH/EfDQbi3TH/OwFKA1L8x6noeSvRXOu2m7WW6QxbuJW1NrBHczmh4kbbhWBy5V6g8Oz2J7L9huferUcIU0klX+nIP1qy/DNx33iZ7E2VMXS7uSoIeYTECH23mzp0laee3p1rpPtcu635p+5tRojajqg406EaFJGoq59fhnl1FR/BMByFAlMSlxFa1IEtSHtKU4UFEgJJxjSMhO242qwXLv5l2SLouOYKlKDGs51pOnfAxhWQnc55dKyV7iQEe3xpjCw06CoIW2nVrRnmOStwPPBz51zbiHgSAeKi/PkXOS3PlLU66yylDbAJJUpaiTsBk5xXSmi5DSgLKHUpy5rUrJUTsdvQeWR61ELW0ifNWzJmLccd795hp7cDScbZHhVnJGwO3kaJi5rBt1lXIt5tHDL1zZml1CVvOrKgULKQohOABjSd6trHCEzuGHorlphIQ4ovKYiN6u7PukleQkjln1HOpWHe4bLUfMB5h0rUgMBIO+ojPIJI/Wz/OtG58Yi2Nzm1yGVMAqWllOFKJ2GdO4wCEnHIb1VuS3WdpqPHeQ3KkLLKUh1T6sYyDnxEBCcDOdI2HOoC9xLbDYYu5uHs0ZCMqTHKAh1SVghRWRk52HhHnXM7t2mXl+PIiwEiMxIP53We8K/kdk8+QFVdu7THpRVNlOPJX4VazkAfDy/hmi6dBvHHMS6z2EIisvyyQ0NCVFCxjCRknnnHIYqr8eWO58PXdsXW2OQWbgwh9DZwdikZII2znJ28/Wq/MYXDkB1oqSkKyhQO6SN8Z8x5/A13HhqWx2vdmbnC09xA4ktCC7b3Vc3ANyj4Hf7/StYzbNvp7uDPNlpek7gjII5EedeK3HWnGHnbdMQWnWllPi5oUDgg+lai0qQopUCFA4INZbflKUoFKUoFKUoFKUoFbEWbLjbMvrSn7PNP0O1a9KCXF3ZkDTcILbv7aNlf18CKexWyX/c5vcrP6j233//ANqIpQb0q0z4+SpgrT9pHi/3rRrZizpcX9A+tI+znKfodq3TdWJIxcISHD/mN7K/r5igia2Yk6XF2ZeUE89J3T9DtUhHtttnuaYlybjKxnTKyB9QP51IyOA+IO6bdt8U3JC8f3bxkE8hgUGszf2n2w1cYyXE+enWPodx9flX67bbNKYXIiyiwlJGs7rSnPLIOFD8Kh7jbp9tfLFwhSYjqeaHmig/Q1YOEbLOvfDl1i22MX5JkRyQDgJQA4Sok8gNqCKVYZ6tKoiUzG1clsHUPn5VaeE7WEQFu25x72pKlB6S2kk6ShSQEAbka8D1x5Vc7N2dWizRkwrhfESJUpsOFMRZQFFG6kd55DO4AycZzVgTNNstKA29HtzTRcWEPnLbqcjBCwfPcas53olqI4XtNxh2z2aSh2HCfAjsRO8DjjWopUtxf6u+CDnOM4xyqy3Jtv2uII7bKRHQtlhLwyAQUjSR6eZ5+gxWrCuTE63w55eZWp9TncraUoJ0JOnUnYnORpOQASB61r3ePJ72NI7xbi1kpDawQnWNOVagNsdfxoxbtkRKbt0DvZYWc60kAnw+I+X3Vz/iPjS3xZiCzbHVFxIcIcWFBQIxnJ3HI+EbZq1OyW35a4Tz+JQTrbaVqCVAkjKSfI/iM1zDtKisR58NUdC0oUwQoKGMK1FRHy1UMZ2j3xJxNfJscdxNW1DKd22gEjHnsBsT9DkVk7LOIYFnvei6RYz7T/hS6+2FhsnY5z0PI1VoM1yKdONbeclB/h/W/WpAQLdcE64ctuO6dy06cD7/AOGflVl1dt3Ga0n+1fhBqwz03O0pUqzzFeAZyY7nMtk+XVJ6j4VRqvrPEF1/4eXwxc2GJUVYCC8h5K1oSPdOkHcp6GqnfLPNtDzSZLZ7t9HeMO48LifMfypdfCY713IExvuzGlgFsjGSMjHkeu3Qjceo2qUsT8zh68MXmxXmKw+ydSCp3BHocc/uqtUqNLdxNCN8hSOKm58d6WVg3CMleVoJwA4PNJ+6q0n/AJlvR/jIHh/bHl8RS2zHYMtL7WDjZSTyUOoNbV2iNoSi4wM+yOnYdWl/ZP8ACgjKVsuASGy8gAOJ/SJHX9ofxrWoFKUoFKUoFKUoFKUoFKUoFKUoFW7hW/zRENuROdjrCcNqSdjjkSOuMDn0A8qqNem1qbWlaFFKknII6GguC+PeK4jiosyQ1JSg4KHmgpJq48NcY2NNtGlUWNKlgd6yw13ay7gjAwAnHLBJ5muetOw74whmSpMeakYSvkF/15VFXG2zLe5pkNKSM7LG6T86u6z6Y6JxpxHxPw+4003azbW3WwliUvxLcSM9dkpUMnIAB8651cLlPnr1TZjz56a1kgfAdKu/CvHEaVAPD/F7QmQHMAPrBJQeQKsb5H2xuOuobVqxeB0XjiOPH4ZnxrhCffQlKS+kPIBIyCk4zjffG9L4J57xZr+LnEh2O1WSYVNxYLLchlshDzbqkhailXopRONj05Gty93S7WbhofnpEpQfcXJeQskhatIUUE50Y546GoC+3U27iu6xYqFiXLfcIdXlKc58LSfkAnI64qS4ddZg2DXckOOOuSe+S2W8vLSlAIQrP63rzOBmszwV74ncjQnEzpS1SGR3a4yknStrwhKiccgcjOx+dQHHENpqww35Cy9HkSFLYka9SkBSEk4806kqHy2rf4ngy3OJW0JW4th1oLIcT4EAjxYIA5Zxp6g+m0PxFHbRwtJjR2dMSM4y7HXqKtQUVhWT55IqxPiKZJYWwsJXggjKVJOQoeYNYqzx5GhBZdT3jCjkpPMHzB6GkiPoSHW1d4yo4CwOR8iOho2wVKwbpqhptlyK3oIJLe/iYJ5lP8qiqUG7dLe5BWlQUHo7gy08n3Vj+B9K0qkLXcfZkKiym/aITh/ONE7g/aSehpdLaYzaJcZz2iC6cNugcj9lQ6KoI+t+0T/Y3FtPI72I8NLzXmPMeRFaFKCQuUNy2ym3WXO8jujWw6BstPkfXoRWvIbQpv2hkYQThafsH+XlUjZ7slu2v2WchLkGQsKCinK2Fj9ZJ6Z6jrWnKYetkwtr0rQobEe64g/18qDSpWaQ0EAONkqaX7p6j0PrWGgUpSgUpSgUpSgUpSgUpSgUpSgVL27iK5Q2izrbkskY7uQgLGPTqPrURSglVXWMtQUuywCeuNaQfkFCp3gm+yWby5IixYcNEaJIePcMAKJDStI1HKveI61TavHZR3DCb9Pfjh8IgpYbQVacuOOoCd/PY7VKN6OiNChC7XLvNa0hQjc9PLKiD5HrzGfpOTLVMv8AwzGceW2xMdualRZTeA222EIKVEjmMHp1qo26AubcHEmTLCFKyt1YCg2ofQpVvjSRgj0qycRSJFm4QiG0LS7GS4sBBUdJTkFakj7KuWBy3PwJWv2hTVO3FVrIUFOgKW6E7Sjy1IPQjA8PX6VFwnJ7vBt2tk9kZLZdYdKt1hBClEDryG/+9T3GUWAHhcZjevUAtEdKv0isagBvnI3Hnjz2xq2B9riqWhx15hqUlLrKQBpQWnEKToI6EEjHQjOOtWJ+ly+ssZ9bCiU4KVDCkqGUqHkRWxdbXMtjuiS2CknwOtqCm1/BQ2NaVGm2tht5JdiZ2GVtE5Un1HmP69a1K9IWpCwtCilQOQQcEVtgsztlFDErz5Ic+P2T93woNKt61XF2AtadCXo7o0vML91Y/gfI1qPNuMuKbdQpC0nBSRgivFBKXK3Nez/2jbVqehE4UD77J+yr+B61F1tWyfIt8jvmCCCNK0KGUrT1SodRW7MhR5jK51qSQlO70UnKmvUeafwoIipW2yGZcYWucsJTnMd4/wCGryP7JqKpQbbiHYElyJLbOM4Wj8CP4GsMhrulDCtaFboUOoqUjOou0ZEGSsJltjEZ5R2UPsKP4Go8amHFxJaFJAVhSSN0K8xQa1KyPtKZXpVggjKVDkoeYrHQKUpQKUpQKUpQKUpQKUpQKUpQKufDsNB7PJ8h6UiKy9cmgtefEUtIUcJHnlxNUyunxZdvidn1ksFwQ4lEht25LcaQFLbKnC2F6TssBKASnnjJBqURSr45dYTcC3uIjZWUaHcBMg/YWTyyOW+OY2qfjJj23hW1xX4z5W1Ide9ikt4wpWxbBPPkTtzyPhUai0WqxodfvyobjbhSIrsdCgl0EBQUpB26jbHnUtxFCVf7Ha4jiQm6vpUYWherJSo4GRsQUkHl6jyJKju0aNd2r426yy5KgLSlBaTnwL8/2VbZCqi1tosFyanMoSqWVNqeHRttR3OPXkelTvHlwfh8QPMtoSLk4y33ja1kJdAySB+1kny5bVUbO4+9cUMFDkmG4TlTh8TAPvgk9PMHnz2NVJ4a13mSbVxDdIaNK43tTgUw4NSFDUcbdDjqKwGFCuI12xfcyOZiuq5/uK6/A71tdogaVxVIksFKmpKEPIUk5BBSNx8war4JByDg0WeHp5txlxTbqFIWk4KVDBFeKk2rk3IbSxdWi+hIwl5OzqPn1Hoa8y7WtLBlQ3Uy4o5rQPEj95PMfhRWFuUhxpLEwFaEjCHB77f8x6H5YrHJjLZwrIcaV7jifdV/I+lYKzRZLjBIAC21e+2rdKv686DDWWJIeiyEPx3FNuIOQoVnXFQ+guwSpWBlbJ3Wn1H2h/RrToJtceNekF6ChLFwAy5GGyXfMo9f2fpUKoFKilQIIOCD0ohSkLC0KKVJOQQcEGptC49+AQ+tuPdMYS6rZEj0V5K9evWgg6nGlJvrCY7hSm5tpw0s7d+kfqn9ryPWoiUw9FkLjyGlNOoOFIUMEGsaSUqCkkgg5BHSgzpVoKo0lKkpBI3HibV/XMV++xP/AKvdqHQhwb/fUoVN39rC9KLshOAeQlAdD+3+NQikqSopUkpUDggjcGg80pSgUpSgUpSgUpSgUpSgUpSgV07jS2TbdxBEYi22bLmQ7ZFjsIbZUUoIaGok43yoqqlcFW9Nz4qt8RzHc96HHieQbQNaz/4pNdeuPFPEDcD2t2zypD63XUvtpQrvUNlW2lRBCsHrjGFDyzU+RQTY+MZL630wHlNOpy+xLcToSAN8hR2HUHmKucJiRbrPBEW7262yYzP5lbTneaCVDWlRG6gdWDjltU8w9ZbUs2eCGIF5moSZp1Nh9pCxkIwCN99wMncisUa0+wSmbhLtqZa4y8lCY6dkqSMqO4CNk8vUZFGd91b7WeFH7lfESILjYU0Es8zpUOhTgf16VWJTSGC5Yp6X7cpwBKZbqMIeV9pR+m/lzxzrqvFV7s9ovhRcJpYCfElrZCUjSgjBGSfgBjG2d6r90uNjjwWZba5TlrkPnQgISplorGrSoHJTnIxzxqz8CY3s5xxzbX4FvsKpLeh1UNbSsHIOhxQBB6jBFVeuk9qAbnWCO7HCEC2P9w6wgJwzrSCB4fUEb/hXNq1Vx8FZokmREfD0Z5bTg5KScVhpUaSxft1y/vKEwJR/xm0/mln9pI934j6Vpz4EqEUl9sd2vdt1B1IWPRQ2NatblvuUmElTaClxhf6Rh1OptfxHn6jeg1ULUhYWhRSpJyCDgitwusTdpGlmR/mgeFf7wHI+o+fnWcxrfcDmA4Ikg/8ATvr8Cj+ws/grHxNR8qO/FfUxJZWy6nmlacEUCQw7Hc0OoKTjI6gjzB6isVbMeUW2+5eQHmM50KPL1Sehr27DC21Pw1l5sDKkkeNHxHUeo2+FBvRp8a4x0QbwopUgaWJgGVNjolf2k/eK0Lnb5Nukd1ISPENSFpOUrT5pPUVqVKW26BuP7BcGjKgKOdGfE0ftIPQ+nI0EYCUkEEgjcEVKp4iuoSAXkKwOamkkn4nG9YLlbjHQJUZwSYSzhDyRyP2VDoa0KBSlKBSlKBSlKBSlKBSlKBSlKDoPZBBZEe93aVJREAjCDHeWQMOvHcpzsVBCVbdcgdaul94vkcJ2ZmOyX3r5IYDMdp4eNpsHAdWB+soAbeQHrmHscSPY+zaBNukZhyGtK5hbeXgPvrUA0nHUJS2lZ57KwOdc2vd4k3K4SJjjilvSFEuuq95fp+ynoAOlSC08LS/ZhLuLcVN7vz7p7xS3SFJSRlfdfac357+gO9WG5XqHajEmXRcp1iQwloRO9y8FEJJeKsbKRtg45+ma51wswubLMJsOqdOHWUtHxqWjJCU+p5V1uLe3nmhClyWo9zcZ75l91CSW1k6ShwqGxJ2TnOCMn1I0ePkMMz48aUwq42Z+OwlLrjZL2vukkK70bJOnBO+++1Ujhm9pt1zkKdWp+zzFBEhISMtYPhVg8iPPyq9drdzlQ4AeeSG5U22sMPoycBRbQdgDjbxb48q40w64yvW2rB5HyI8j5ikJNx1+JYJEqw3mKGW1QnmAhmYtwOPSHB4ms43HIgeh+FccIwcGuj9n1xZu4i2d99xuREd7+AjvyhJWN9BPIg42zy3G4qsdoVrFo4vnxUABpTnetaTkaVbjB8t8fKtfCTzpX6UpUaKUpQKkI10dSwmLLbRMjJ2S27zR+4rmn8PSo+lBIKhx5PitrxUo/wDTukBwfA8lfcfStMF6M/ka2XUH1SpJrHW4ietSA3LbTKbAwNZ8aR6K5j4bj0oPXexpe0gCO9/nIT4VfvJHL4j6VglRXoxHeJ8Kt0LScpUPQ9aziIzJP/Iv5Uf8F0hK/keSvuPpWNt6VBWthxBCSfGy6nwn4g/jzoFunvwXFFrSptYw40sZQseRFbvf8Pq8RgTUk7lKXxgegyOVawYiy94qww6f8F1Wx/dV/A/U1jNtuAJBgydv/SV/Kg1aUpQKUpQKUpQKUpQKUpQK3LJb3breYdsY/Syn0Mp9CogZ++tOrf2VILV+k3jQtX9mQnX0aUFR7wju28AczqWD8qlFg7cYb8p6Debc44uwoZTCjsnGIy2UhCkkDqcBWefiGa5hX0Va7bOutouluFnTGt8yH39sCo2nu5affaWSMeMkpz1JGOpriszhmcuWw3CZS448rS4wlYJjL6pWegA3yfXO4NJ27DX4LZlyOKbezDZdedW8ElLZwdJ2Uc9Ns79K6PxMvht/ixrhtfDU5Ti3ApT39oFHh3OtQCTnSnJ5+fnWXgu1nhlp52OuHKZkQ8vyEEKWnJwR6AK8OBnzJ3FTPGTcKHIlyrgD7VNZ7uOtSNJjtlI1qcI20k7EjB6dalvcYO2GyQ+IocGRaphMsQUOxopXr79tCAklKv1jgA+fOuFEEEgjBFfRMq0S1WLh1tuS2mdEjoLao6E6FJBV4geicYxuM5Gx3xz7j3guZO7jiGy2xaEzni2/FbWFpQ5nGtChsUK556HINaneMY9vLn1vjypc5mPBbcckuLAaSj3irpirv2rWW4QbdZZdymNS5oaVGlKb/wANacKCD6hKt6t/AHCsSyssCQnMx9PeyZSkEobaBV4BywlWggq58jyrR46lsX+x3yHGLDxiuCeh1Kz3h3woFJAwNJ2I2OKsXL7cfpSlRopSlApSlApSlArbanvBsNPhMlobBDu+n4HmPka1KUG+mPClf3aR7O7/AJT58J+C+X1A+NZBa70BhMeQQOWlWR8sGoylApSlApSlApSlApSlApW0i3TV2ty6IjrMNp1LK3RyStQJA+41q0Cut9lvD19HAMq+WubHtaH5yfaLg6rxR2Gd9SE81ErV0+z9OSoSpawhCSpSjgAcya+vuGOD4fDvAkJmXa5L01iMiO42y5rU4pw5V+bGdgpa0nI5HntWchFcOcNXNu6O4uMa3oUym4RCJQUp5A955wafzYVz2PhONudak7hu0vcUyrvZLraBZZ75euDhaKy8DnKW1EaQkbkY689q0u0zic2G3S7RHDEO1SG3Y8pZbPfSFA4DaEncoGd1cvpvy3h3i9ci4x2JcPu7bEOq2NNKLbcV8e6pRTzCifETzz5U0OvweAI7PFV2Wni9Hd/m2fZFoWpLI8K8ZH7I2x1zmo/tN4FtM5xl66doDNuh+4howVHvFDcYwRkYAxnyqXtHESZ1lhy3bUW3JC1d46Nf6dCVAqKdjoO5BOxyBVbu3Ejkbi9USJGaukaWpt9Cm21YL6TpUhCQBqOE78xtWdXe9jfuNvai8NWi1wrm64y1FQiO8+yWlOEFYCgk+6RkkHpjNYbTBkcOsxYkhxtTi3lmT3xQgOIHNIGrBJ5kjGT5mpXimxotfDVki3uMl9IjCTIS0twFBU465sFHKsdQeW/lVBl3R24RZV8uvDiFXBcpP9kstKcX3zmNilB30gYOBzxyFax8MyLRxhZ349vls29p1xL8cRo7bjqkOBvcrKlbggJUEjbIHPFVXg63XiJNTCu1nZjW6Q0plLzC0q8BSpOFFRKlJBVnbkcbdK22E3/hy0xonGSEvxrisvqkKUVmC6pQOlwpxp1bZGduXTFWCTaYT1qZC225T7pyhTbyG0pUhRKF4J548850786svzFs+K+fLlEcg3CRDeBDjLikK+RrXroPaBwjeZvH01q1wnJi3m0yVBspOMjCjsce8DyqlXC13G349ugyI4USAXGyASMZ3+Yq3zol3NtOlKUUpSlApSlApSlApSlApWaLGky3QzFjuvuKOAhtBUT8hVmg9m/HEtsOJ4cmsNn9eSkMD4+MipcpPIqdK6Na+xrjCe5ob/s9P/3Gr8AasLP5PfEgQFzLpDjgjOzalfyrhl1XDj5ybx488vEcYrPBiSZ0tuJDYckPuq0obbSVKUfQV3i2/k599/euJgnzCI+PxNWjhzsTPCz702zXN2ZLdZLOt0BKUAkElOnJztj4GuWXX8M8XbpOm5L8ORcK9llxdcg3G+PxY8Aq7x+P3n54pAyE6ehVy9Kv3F/BXBfE0KU9aLZH4fmuqSpp1oqLOpIwUFOdgRvtvmrJN7OeLpDK3Hp0VKivOdSs4OOeRWOTwHxR7OiOxIgJbQoHSpwjfHMbdedePLrM7luZR3nTTXeIaai223hm38GW9iNPgKSG3mnBgvOagVOkjGDn6AAVn4gRw5O7q3XHh+2mIwnRGCGg24jYp3UnBUAPPqB5VozYCOGpT8icpuTLKMNltRU21v8A/tWCBeYsjvnZcRT6lIS4SRjIBBIGfhmp73JZuWntY70nuHrTwHcOJeHo0PhZpBtiw42ttR1vFA1HvOq9xnfzxy2q1Xzi5PDd4kMPupnX6a4EvpaHggtdGxucr86qMW4tMMCRrDDbqVIYS2NCm0H3jkenWsIv1pZuYbiMtkIaCA4s5O/XJ5n1pOqymOtW1m8Hf6adx4Y4cevTNxvKLjdZoWpWl0BMdWrknu9/CDnrknnUzBdEBsw4lqhw4IWQYiG06F58x9+9ar97ZKGleArTqTnG5B5YqBXMcfuZbQ6ptSk5AUeWedcve5eT/aunt4Y+ExdJb0SQ6+tCHGpByE/5auo/dO+3KtWDxE+Jiw0w0qQ3nuXktgLaSfeCSOWcb1tGUxECGU6XVKSfzqhsSDy8utfltTbm5jrzSUNod0ttoBz4ualfOp719Gsk9qTLcXBd6ULbwq5JS26ZyJLL65Kc6UIdKjnPTSCPgaqVy47hybw/KjR4zbiCWozikeNpvfGn7JOTkjHOpO+yIq7YyhMohcZKsDZWUuHKh6ZqiT7JZG9DiZbylqPM4Gncda9WPLjnhMe7hePLHK1NP3AKaX373eNyElLiFDUlYPQg860JFyYh+ztQUtMNN4CkDxDblz39DUHLmx+6aQlRS2lXQ5wB13r0xKsxkZe1Pj0OMmt8WN4+/djOzKr5C4jMlmXlDKJbmnU4hITy3wD0G9R10vCnEex3GCy+y7qZKXWkqJQcZ3+QOfMCqxJl29tALDrjJJJBSrYHyx6VoJvcmM8I8p1TiTyUnrt5/Os+zbl65W/XJNNW88BQZheXYJaxJSDphuj3yPsq/gfrXOnW3Gl6HUKQrAOFDBrqg4hcT3bsZSULb90nr0NSEC12DjBJXxO5Mjus7MORkpCiD0USDkDG3lXsw5MsZ+abcrJb2cYpXbXeyfg1w5j8S3FCf/VaT/AVmjdh9kmY9k4tUTzwtmreq4553P8AlJhb4cMpXbJnYDKbUS3xXbtI38aMHH1qKuXYy9FaJa4ngPuj9Tu8A/PUaY9VxZeKXjynmOUUq/f/AAtvC3NDNztij+0paf8A21mb7F+PpKCq32+HcMDOmPNaKv8AxUQa6+7h9sac7pVrunZxx3bQTM4WuaAOZSzrH1Tmon/hriL/AOQ3T/8AEc/lW9joR7feO4yG2LIzYLDFawEsW61tNpwOhJBUfrX0N2V3W39qHZ8q9Xy0OWi5tqKFSFHEWUc+83qyT6joetfEVZA88G+7Dqwgb6Qo4rlycOOc0sr7MetDjE8x7ZPiOOtgud2y8guBI66QScfKsqOIL1DdDDyTy910EE+tfFrTrjS9aFqSrqQcZrtdh/KGucWxW6y3fha13KLBZDSVhxTbqwOWVHV02xivDyf4/wDbXTHlyx8V2pviuQCW5sRtSc+82NwPXet1HEFodCQJUiMfIdPlXJbf24cBT1FF44VulrBxhUN9EgfMK0/xrqPZvbOGu0iI6/w5cZjaGRqUmXbFt5T5hfuH4BWa82XRZz4dsepyiRRMS4VKYvLTpA5Oq2Hp13rZR7S4SVKjPpBwSlWOnrXub2WQm21PMXlGpJwcsHI2z0zVTucG4WGQB7eot41J1IIyPPBrz58Fjtj1f3FmejxF7OW8KJxvqBHyrQlWSzvIOuOCN+aBv6edVxniyayS28pDuOQQDnGako/GcR5IEht1OdjzyD8q5XDOOs6jjy+X7M4K4emoSTqwBgJRkADyrQPZxY0pKG29v/qkb/Opxi+29x1CE92kZGVO4AHXmazOXS3lpakBp8E6lePOPOnrzxb/ACZKfK7PYJV3iVPpOnSMO5GKipPAbjLveNvLQoDCdZHXyrosa7xi0e6dwlJHNI9duQr9RKYcOS+t0jxqOMgem21X3cz0YuRy+Ar04wEqmatJOghs7HPx+VYn+E+II6UFgNAo3CNxqx61112ayhZUSdJzghWR8AK03p0RuOMsNJI5KUsk1qc2bN48PtyCVZuKnXA2LbqTjClBad/LrvioNXCXF7ilsuW13BOrUkggnz5125FygBK1d5GAOcjUSob9M1gl8QWxkaPalPchhI5V6MOoyx8YuOeHHfOTjDXAfFLiTmIsBaAnHMA+dbTHZxfS4F9zpJ8J65PrXUXeK2snumlE42x/XOtVzidbqlFLHdOY6EkkV3nV8v7Y894+GfqUhjsyupSlLqtJJ2ORzHxNScfswUAhMyYhIzkFbuMfSpdd1uD+QnXy2wnlX42q5PDStaj56lH+FPxHN/EY3wz7pG7NbLHSFSJ8VOcHln7zUhCtnB1tHjuDb2nmEt4H1rJb+FbvdFAsMyHlEj9H/vU5buyDiWZpzBcAByUuEA/Ss+vmy/V/UX14TxiijduFmto9r9oHmWxy+daEniGMpWItkjtD1UfwFdCd7JLTaooe4k4phWUAZxJkNtpHpuoVWrq72I2htQuHabbpK080wmFPqz8Ugj761jw53v3/ALS8uV7dorL81b6RlqO0ryS2T/Gs8BqepJLbkg6uiGNvlWC7dsnYxZWe7sfDt64hfA99/TFbJ+OSr/TVea/KUbhpcVa+zm1Rns/m1qnvqCR6gYz9RXWdNyVz9V+3R7RwzLuTC1LusxtxOdLRaVlfoCMAfOoHiziKb2c2t5cqy8RwHXf0U1txlSc+RClqGD8K5jxX+Ub2rX5hUZu/Js8VW3dW1oMnH7+6/vrlVwnTbjJVJuEyRLfUcqcfcK1H4k7134+lmPfJNrpP7VuKLg4pc+PYpqlHOqRaI6lH4nRkmow8cTySf7JsW/lASKq1K9WpEKUpVClKUCukcFduPaZwfYWrFZOIi3bmc90y9HbdDYPQFSSQPTNc3pUs2Prns9/Kf4WuNliWntGtU5mdgpfukJCS2vnhRbTgjpyBrpFjuHYnxSpKonH9vkOOHwtSHhHcA8sOYzX8/qVyy4MMu9i+qv6UHsk4Xntl23y1ONqHhUy4lYHzHSo25dkTIAUxJfyOmdO3yr+fFqu92tjyV226ToSgfejyFNn/AEkV9JdivGHF0txhErim+SE5GztwdUPvVXPLpsFldRunZdNYUp1hD7+NyACT9ScVXZPAnEbUpRjWqTjGdRHL6Gvpvgx12RaG1vuLdURuVqKifrUrKZZKt2mzt9ketcsumn21HyaOFOLEOHMTVnI0fz3rXn2XixvKXIbyUgHGlJ0jPSvp99ppSFBTSFYBxlIrBHjx1s5Ww0o4HNANcfw+O2937fKzfC/FMkoCYElwY26f71uN8C8T6O8XbFp1dFJJNfVsSPHS0ClhpJ8wgVCdprz0PhN96G65HcAOFtKKFcvMVvHp5fljT5tV2d8WqbVrt7gSNwvBxX612fS0uoNxkwYvi9555KQPqa4D2q8V8Uv3x5h/iW8utaiNC5zhT9CqufOuuuq1OurcUeqlEmus6WX5Yun2wjgXh9hvvJfGHDyU9QZzeQf/ACrXVH7L7e+lFx424dbSn3lCclz/AEpJr4spW/wmP2bn0+2Xu0D8n2zNBDvE6ripIwRFhOqz8PCB99Qlz/KS7JrX4bBwLPuS0jAVIQ0wlXqfeP3V8g0rpOn458G6+ir7+VdxKtKm+GeEuH7Ik+64ptUhwfM4T91c34l7bO1TiELTcON7slpXNqM77Oj4YbxXPaV0mMniG2aZKlTHi9LkvSHTzW6sqUfmaw0pWkKUpQKUpQKUpQf/2Q==" x="0" y="0" width="121" height="121" preserveAspectRatio="xMidYMid meet"/></g>
      <text id="fcGridVal" x="445" y="269" text-anchor="middle" font-size="13" font-weight="700" fill="#e05c00">-- W</text>
      <text id="gridImportVal" x="397" y="165" text-anchor="middle" font-size="10" font-weight="600" fill="#cde">-- kWh</text>
      <text id="gridExportVal" x="397" y="192" text-anchor="middle" font-size="10" font-weight="600" fill="#cde" style="display:none">-- kWh</text>

      <rect id="fcInvRect" x="205" y="155" width="110" height="110" rx="18" fill="#161b22" stroke="#f4a93b" stroke-width="4"/>
      <text id="invNameLabel" x="260" y="203" text-anchor="middle" font-size="14" font-weight="800" fill="#f4a93b" letter-spacing="1">INV</text>
      <text id="invTempFlow" x="260" y="222" text-anchor="middle" font-size="12" font-weight="700" fill="#58a6ff">-- °C</text>
      <text id="invLoadPctFlow" x="260" y="240" text-anchor="middle" font-size="12" font-weight="700" fill="#3ce878">--%</text>

      <text id="pv1label" x="8" y="360" font-size="9" fill="#8b949e" letter-spacing="1">PV1</text>
      <text id="pv1FlowVal" x="8" y="374" font-size="12" font-weight="700" fill="#ffe83c">-- W</text>
      <text id="pv2label" x="8" y="392" font-size="9" fill="#8b949e" letter-spacing="1">PV2</text>
      <text id="pv2FlowVal" x="8" y="406" font-size="12" font-weight="700" fill="#ffe83c">-- W</text>
      ${pv3txt}
      ${pv4txt}

      <g id="homeIconImg" transform="translate(179,339)" style="opacity:1"><image href="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAD6APoDASIAAhEBAxEB/8QAHQABAAEFAQEBAAAAAAAAAAAAAAcDBAUGCAIBCf/EAFgQAAEDAwICBQYHCggKCwEAAAEAAgMEBREGEiExBxMiQVEUYXGBkaEjMkJSYrHBCBUzcpKistHh8BYkJTRDU2OCFyZVZHN1s8LD8Rg1Njc4VISjpLTE4v/EABoBAQADAQEBAAAAAAAAAAAAAAADBAUCAQb/xAAzEQACAgECAwYDCAIDAAAAAAAAAQIDEQQxEiHwEyIyQVFxYYGhBRQzQpGxweHR8SM0Uv/aAAwDAQACEQMRAD8A4yREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBEVejo6usk6ukpZp3eEbC4+5EsnjaSyy5s1kvF6ldHabXWVzm43CCFz9ueWccvWssNG11NLtvVXSWnHNszi+T8hgJ9uFI/QHar3Q11RbpLZMKmuezyZgA3uIDsjg9pHBTHW090gj2Xm3VsTW91XE97P/AHY3j85euSrffizmOblmqS6/X9jmeh6N7jeKaSo07cqK6Nj+PGd0Mg9Txt/OWq3q03CzVpo7nTOp5wM7SQeHpHBTNdavUdyuNVS0QqH0TJntiawhkW3JxgN7OFEera9tfcgQ0gwgxuJGOIJyp7IQUU1uRVzm54e3Xt+xh0RFXLAREQBERAEREAREQBERAEREAREQBERAERVaWnnqqhlPTQvmmecNYxuSfUgKSLZaLRd4nw6oNPRtP9bJl35LclZij0RbY8Gsr6ioPzYWBg9pyfcpo6ex+RUnraYeefbmaErijoqysfspKSed3hHGXfUpPorNZKPBgtUDnD5U2ZT+dw9yyfXSdWGA7WDkxowB6hwU0dKvzMqz+0//ABH9SOqLRN8qMGaOGjae+eQA+wZPuWcodBUEeDXXKac97IGBg/KOfqWzPkZGN0sjWD6RwvkVSx5+BimmPdsZw9pwFJGmteWSpZrdRPZ49ilbtN2CkwYbXFI4fKnJkPv4e5ZuPLIxHG0Rs7msAaB6gsf18zPwz6al8BI/c78kK+o2tlGdldV58G9Sz34P1r1z4dipJTnzk8/U3PoXxH0paeLiAfLBgZ+iV2OwscMOaCCuKej28UVl1/Yp6qS30UTK1m/t7nDORxPDHPmuvqC4sk5uWdqp8Ukb32TDhrfucv1sbBcKkgAHrn93nK5y1/YnQVEl1pYHMgkeetaSMhxPxseBXRNXLmuqjk/hn/pFRPNHE8yxzspo2vyD1r97iPQta2pTjgz56iVM1JEPostqe0OtVcWsLn00nGKQtIz5uPgsSsqUXF4ZtV2RsipR2YREXh2EREAREQBERAEREAREQBERAEREAHE4Cm7ob0iLFcaC53Sma+61EsYjglYSKaN/i3vle3OB8luXFYfou0aKKKDUl4haah4EluppWbg0ZwJ3t7+PBjOb3Y7l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" x="0" y="0" width="160" height="160" preserveAspectRatio="xMidYMid meet"/></g>
      <text id="fcLoadVal" x="174" y="420" text-anchor="end" font-size="13" font-weight="700" fill="#F7F6D3">-- W</text>
      ${evtxt}
      </svg></div>`+

      `<div style="display:flex;gap:8px;align-items:center;margin-top:10px">
        <div style="flex:1;display:flex;align-items:center;gap:4px"><span style="font-size:.42rem;color:#8b949e;letter-spacing:1px;text-transform:uppercase">PV</span><div style="flex:1;display:flex;gap:2px;align-items:flex-end;height:10px" id="pvBlocks"></div></div>
        <div style="flex:1;display:flex;align-items:center;gap:4px"><span style="font-size:.42rem;color:#8b949e;letter-spacing:1px;text-transform:uppercase">Pwr</span><div style="flex:1;background:#21262d;border-radius:20px;height:9px;overflow:hidden;position:relative"><div id="pwrBar" style="position:absolute;inset:0;right:auto;width:0%;border-radius:20px;background:#3fb950;transition:width .4s,background .4s"></div></div></div>
      </div>
    </div>`;
  }

  _updateDynamic() {
    if (!this._hass || !this.config) return;
    const root = this.shadowRoot;
    const getEl = (id) => root.getElementById(id);
    const setText = (id, txt) => { const el = getEl(id); if (el) el.textContent = txt; };
    const setAttr = (id, attr, val) => { const el = getEl(id); if (el) el.setAttribute(attr, val); };
    const setDisplay = (id, visible) => { const el = getEl(id); if (!el) return; el.style.display = visible ? '' : 'none'; };

    // Fix #4: use null-aware helper so unavailable/unknown sensors show '--' not '0'
    const _n = (v, fallback = 0) => (v !== null && !isNaN(v)) ? v : fallback;
    const _nullOr0 = (v) => (v !== null && !isNaN(v)) ? v : 0; // for flow/direction values where 0 is valid

    const pv1 = _n(this._val(this.config.pv1_power, true));
    const pv2 = _n(this._val(this.config.pv2_power, true));
    const pv3 = this.config._show_pv_extra ? _n(this._val(this.config.pv3_power, true)) : 0;
    const pv4 = this.config._show_pv_extra ? _n(this._val(this.config.pv4_power, true)) : 0;
    const totalPvSensor = this._val(this.config.pv_total_power, true);
    const pvTotal = (totalPvSensor !== null && !isNaN(totalPvSensor) && totalPvSensor > 0) ? totalPvSensor : pv1 + pv2 + pv3 + pv4;
    const _gridPrimary = this._val(this.config.grid_active_power, true);
    let gridActive = _gridPrimary !== null ? _gridPrimary : _nullOr0(this._val(this.config.grid_power_alt, true));
    if (this.config.invert_grid_power) gridActive = -gridActive;
    const gridImport = _n(this._val(this.config.grid_import_energy));
    const gridExport = _n(this._val(this.config.grid_export_energy));
    const load = _n(this._val(this.config.consump, true));
    const battSoc1 = _n(this._val(this.config.battery_soc) ?? this._val(this.config.goodwe_battery_soc));
    let battPwr1 = _nullOr0(this._val(this.config.battery_power, true));
    if (this.config.invert_battery_power) battPwr1 = -battPwr1;
    let battCurr1 = _nullOr0(this._val(this.config.battery_current) ?? this._val(this.config.goodwe_battery_curr));
    if (this.config.invert_battery_power) battCurr1 = -battCurr1;
    const battVolt1 = _n(this._val(this.config.battery_voltage));
    const invTemp = _n(this._val(this.config.inv_temp));

    // System limits – direct numbers
    const invMax = Number(this.config.inverter_max_power) || 6000;
    const pvMax = Number(this.config.pv_max_power) || 7500;

    const dual = !!(this.config._show_battery2);
    const battSoc2 = dual ? _n(this._val(this.config.battery2_soc)) : 0;
    let battPwr2 = dual ? _nullOr0(this._val(this.config.battery2_power, true)) : 0;
    let battCurr2 = dual ? _nullOr0(this._val(this.config.battery2_current)) : 0;
    if (dual && this.config.invert_battery_power) { battPwr2 = -battPwr2; battCurr2 = -battCurr2; }
    const battVolt2 = dual ? _n(this._val(this.config.battery2_voltage)) : 0;

    const chargerPower = _n(this._val(this.config.charger_power, true));
    const chargerCurrent = _n(this._val(this.config.charger_current));
    const chargerSoc = _n(this._val(this.config.charger_soc));
    const chargerEtaSensor = this._val(this.config.charger_eta);
    const chargerBattCapWh = Number(this.config.charger_battery_capacity_wh) || 0;
    const chargerStateStr = this._strVal(this.config.charger_state);

    const sun = this._sunData();
    const auraEl = getEl('skyAura');
    if (auraEl) auraEl.setAttribute('cy', (94 - Math.round((sun.bell || 0.5) * 22)).toString());
    ['arcSunDot', 'arcSunGlow1', 'arcSunGlow2'].forEach(id => { const e = getEl(id); if (e) { e.setAttribute('cx', sun.bx); e.setAttribute('cy', sun.by); } });
    getEl('arcSunGroup')?.setAttribute('opacity', sun.night ? '0' : '1');
    const moonGroup = getEl('moonGroup');
    if (sun.night) {
      ['moonGlow', 'moonDot'].forEach(id => { const e = getEl(id); if (e) { e.setAttribute('cx', sun.mx || 260); e.setAttribute('cy', sun.my || 72); } });
      if (moonGroup) moonGroup.setAttribute('opacity', '1');
    } else { if (moonGroup) moonGroup.setAttribute('opacity', '0'); }

    const pvTxt = (pvTotal >= 1000 ? (pvTotal / 1000).toFixed(2) + ' kW' : pvTotal.toFixed(0) + ' W') + ' ⚡';
    const pvLabelRect = getEl('arcPvLabelRect');
    const pvLabelText = getEl('arcPvLabelText');
    if (pvLabelRect) { pvLabelRect.setAttribute('x', sun.t < 0.5 ? Math.max(4, sun.bx - 108) : Math.min(sun.bx + 14, 420)); pvLabelRect.setAttribute('y', Math.max(2, sun.by - 28)); }
    if (pvLabelText) { pvLabelText.setAttribute('x', sun.t < 0.5 ? Math.max(52, sun.bx - 60) : Math.min(sun.bx + 62, 468)); pvLabelText.setAttribute('y', Math.max(19, sun.by - 11)); pvLabelText.textContent = pvTxt; }
    setText('arcRiseLabel', sun.rise);
    setText('arcSetLabel', sun.set);

    if (pvTotal !== this._prevPvTotal || sun.bx !== this._prevSunPos.bx || sun.by !== this._prevSunPos.by) {
      this._prevPvTotal = pvTotal; this._prevSunPos = { bx: sun.bx, by: sun.by };
      const pvGroup = getEl('pvFlowGroup');
      if (pvGroup) pvGroup.innerHTML = this._buildPvWaveHTML(sun.bx, sun.by, pvTotal);
    }

    const flowDur = (w) => Math.max(0.5, 3.0 - (Math.min(Math.abs(w), 8000) / 8000) * 2.5).toFixed(2) + 's';
    const setFlow = (id, show, watts, durStr, color) => {
      const el = getEl(id); if (!el) return;
      el.setAttribute('opacity', show ? '1' : '0'); el.style.display = show ? '' : 'none';
      if (show && durStr !== undefined) { const anim = el.querySelector('animate'); if (anim) anim.setAttribute('dur', durStr); }
      if (color !== undefined) el.setAttribute('stroke', color);
    };

    const absPwr1 = Math.abs(battPwr1);
    const isCharging1 = battPwr1 > 10;
    const showBattIn = battPwr1 > 10;
    const showBattOut = battPwr1 < -10;
    let battLineColor = '#8b949e', battDur = '4.0s', battShowIn = false, battShowOut = false;
    if (absPwr1 < 10) { battShowIn = false; battShowOut = false; }
    else if (absPwr1 < 50) { battShowIn = showBattIn; battShowOut = showBattOut; battLineColor = '#8b949e'; }
    else { battShowIn = showBattIn; battShowOut = showBattOut; battDur = flowDur(absPwr1);
      if (isCharging1) battLineColor = '#2b59ff';
      else if (absPwr1 < 1000) battLineColor = '#f39c4b';
      else if (absPwr1 < 2500) battLineColor = '#e67e22';
      else battLineColor = '#f85149'; }
    setFlow('flowBattIn', battShowIn, absPwr1, battDur, battLineColor);
    setFlow('flowBattOut', battShowOut, absPwr1, battDur, battLineColor);
    setFlow('flowGridIn', gridActive > 10, gridActive, flowDur(gridActive), '#FF2929');
    setFlow('flowGridOut', gridActive < -10, Math.abs(gridActive), flowDur(Math.abs(gridActive)), '#2ecc71');

    // flowInvLoad color — matches the dominant source feeding the home load
    // PV    → #ffe83c  (yellow,  matches PV flow lines)
    // Batt  → #f39c4b / #e67e22 / #f85149  (orange→red, matches battLineColor)
    // Grid  → #FF2929  (red,     matches flowGridIn)
    const absGrid = Math.abs(gridActive > 10 ? gridActive : 0);  // only count grid import
    const absBattOut = battPwr1 < -10 ? Math.abs(battPwr1) : 0;  // only count discharge
    const absPvLoad = pvTotal > 10 ? pvTotal : 0;
    let loadFlowColor = '#ffe83c'; // default PV yellow
    if (absGrid >= absPvLoad && absGrid >= absBattOut && absGrid > 10) {
      loadFlowColor = '#FF2929'; // grid dominant
    } else if (absBattOut >= absPvLoad && absBattOut >= absGrid && absBattOut > 10) {
      // battery dominant — mirror battLineColor scale
      loadFlowColor = absBattOut < 1000 ? '#f39c4b' : absBattOut < 2500 ? '#e67e22' : '#f85149';
    } else {
      loadFlowColor = '#ffe83c'; // PV dominant
    }
    setFlow('flowInvLoad', load > 10, load, flowDur(load), loadFlowColor);

    // Icon glows
    const battIconWrap = getEl('battIconWrap');
    if (battIconWrap) { battIconWrap.setAttribute('filter', absPwr1 >= 50 ? 'url(#iconGlowBlue)' : ''); }
    const gridImg = getEl('gridIconImg');
    if (gridImg) { gridImg.style.opacity = Math.abs(gridActive) < 10 ? '0.4' : '1'; gridImg.setAttribute('filter', Math.abs(gridActive) >= 50 ? 'url(#iconGlowOrange)' : ''); }
    const homeImg = getEl('homeIconImg');
    if (homeImg) { homeImg.style.opacity = load > 10 ? '1' : '0.7'; homeImg.setAttribute('filter', load > 10 ? 'url(#iconGlowOrange)' : ''); }

    // Battery fill & stats
    if (dual) {
      const fill1 = this._battFill(battSoc1); const fill2 = this._battFill(battSoc2);
      const bf1 = getEl('battFillBar1'); if (bf1) { bf1.setAttribute('y', fill1.y); bf1.setAttribute('height', fill1.height); bf1.setAttribute('fill', fill1.color); bf1.setAttribute('filter', fill1.filter); }
      const bh1 = getEl('battFillHL1'); if (bh1) { bh1.setAttribute('y', fill1.y); bh1.setAttribute('height', fill1.height); }
      const bf2 = getEl('battFillBar2'); if (bf2) { bf2.setAttribute('y', fill2.y); bf2.setAttribute('height', fill2.height); bf2.setAttribute('fill', fill2.color); bf2.setAttribute('filter', fill2.filter); }
      const bh2 = getEl('battFillHL2'); if (bh2) { bh2.setAttribute('y', fill2.y); bh2.setAttribute('height', fill2.height); }
      setText('fcBattVal1', battSoc1 + '%'); setAttr('fcBattVal1', 'fill', fill1.textColor);
      setText('fcBattVal2', battSoc2 + '%'); setAttr('fcBattVal2', 'fill', fill2.textColor);
      setText('battVoltageFlow1', battVolt1.toFixed(1) + ' V'); setText('battVoltageFlow2', battVolt2.toFixed(1) + ' V');
      // Current & power placed outside battery group
      setText('battPwrFlow1', Math.abs(battPwr1).toFixed(0) + ' W');
      setText('battCurrFlow1', battCurr1.toFixed(1) + ' A');
      setText('battPwrFlow2', Math.abs(battPwr2).toFixed(0) + ' W');
      setText('battCurrFlow2', battCurr2.toFixed(1) + ' A');
      const bolt1 = getEl('battBoltGroup1'), bolt2 = getEl('battBoltGroup2');
      if (bolt1) bolt1.setAttribute('opacity', (battPwr1 > 10 && absPwr1 >= 10) ? '1' : '0');
      if (bolt2) bolt2.setAttribute('opacity', (battPwr2 > 10 && Math.abs(battPwr2) >= 10) ? '1' : '0');
    } else {
      const fill = this._battFill(battSoc1);
      const bf = getEl('battFillBar'); if (bf) { bf.setAttribute('y', fill.y); bf.setAttribute('height', fill.height); bf.setAttribute('fill', fill.color); bf.setAttribute('filter', fill.filter); }
      const bh = getEl('battFillHL'); if (bh) { bh.setAttribute('y', fill.y); bh.setAttribute('height', fill.height); }
      setText('fcBattVal', battSoc1 + '%'); setAttr('fcBattVal', 'fill', fill.textColor);
      setText('battVoltageFlow', battVolt1.toFixed(1) + ' V');
      setText('battPwrFlow', absPwr1.toFixed(0) + ' W');
      setText('battCurrFlow', battCurr1.toFixed(1) + ' A');
      const bolt = getEl('battBoltGroup'); if (bolt) bolt.setAttribute('opacity', (battPwr1 > 10 && absPwr1 >= 10) ? '1' : '0');
    }

    const pwrBar = getEl('pwrBar');
    if (pwrBar) {
      pwrBar.style.width = Math.min(absPwr1 / invMax * 100, 100).toFixed(1) + '%';
      pwrBar.style.background = absPwr1 < 50 ? '#8b949e' : isCharging1 ? '#2b59ff' :
        'linear-gradient(to right, #f4d03f, #f39c4b ' + ((absPwr1 / invMax * 100) * 0.5).toFixed(0) + '%, #f85149)';
    }
    const badge = getEl('battStatusBadge');
    if (badge) { badge.textContent = absPwr1 < 50 ? 'IDLE' : isCharging1 ? 'CHG' : 'DISCHG'; badge.style.color = absPwr1 < 50 ? '#8b949e' : isCharging1 ? '#00d7ff' : '#3ce878'; }

    setText('invTempFlow', invTemp.toFixed(1) + ' °C');
    setText('invNameLabel', this.config.inverter_name || 'INV');
    setAttr('invTempFlow', 'fill', invTemp <= 45 ? '#58a6ff' : invTemp <= 55 ? '#f39c4b' : '#f85149');
    const invLoadPct = Math.min(load / invMax * 100, 100).toFixed(0);
    // Fix #8: toFixed() returns a string; use Number() for the colour comparison
    setText('invLoadPctFlow', invLoadPct + '%'); setAttr('invLoadPctFlow', 'fill', Number(invLoadPct) <= 50 ? '#3fb950' : '#f39c4b');

    const gridDir = gridActive > 10 ? '▼ ' : gridActive < -10 ? '▲ ' : '';
    // Fix #7: grid power now auto-switches to kW like load/PV (was always showing W)
    const absGrid2 = Math.abs(gridActive);
    setText('fcGridVal', gridDir + (absGrid2 >= 1000 ? (absGrid2 / 1000).toFixed(2) + ' kW' : absGrid2.toFixed(0) + ' W'));
    setAttr('fcGridVal', 'fill', gridActive > 10 ? '#FF2929' : gridActive < -10 ? '#2ecc71' : '#3a3a3a');
    setText('gridImportVal', gridImport.toFixed(2) + ' kWh');
    setDisplay('gridExportVal', gridExport > 0);
    if (gridExport > 0) setText('gridExportVal', gridExport.toFixed(2) + ' kWh');

    setText('fcLoadVal', load >= 1000 ? (load / 1000).toFixed(2) + ' kW' : load.toFixed(0) + ' W');
    setAttr('fcLoadVal', 'fill', load > 10 ? loadFlowColor : '#8b949e');

    setText('pv1FlowVal', pv1 >= 1000 ? (pv1 / 1000).toFixed(2) + ' kW' : pv1.toFixed(0) + ' W');
    setText('pv2FlowVal', pv2 >= 1000 ? (pv2 / 1000).toFixed(2) + ' kW' : pv2.toFixed(0) + ' W');
    setDisplay('pv3label', this.config._show_pv_extra);
    setDisplay('pv3FlowVal', this.config._show_pv_extra);
    if (this.config._show_pv_extra) setText('pv3FlowVal', pv3 >= 1000 ? (pv3 / 1000).toFixed(2) + ' kW' : pv3.toFixed(0) + ' W');
    setDisplay('pv4label', this.config._show_pv_extra);
    setDisplay('pv4FlowVal', this.config._show_pv_extra);
    if (this.config._show_pv_extra) setText('pv4FlowVal', pv4 >= 1000 ? (pv4 / 1000).toFixed(2) + ' kW' : pv4.toFixed(0) + ' W');

    // ── Label entity overrides for stat tiles ──
    // Per-row: override active only when global gate ON AND label text ≠ its default
    const labelsOn = !!(this.config._labels_custom_entities);
    const _rowActive = (labelKey, def) => labelsOn && (this.config[labelKey] || def) !== def;

    // Read numeric value from a custom entity key, falling back to `fallback` if unavailable.
    const _readNum = (entityKey, fallback) => {
      const s = this._hass && this._hass.states[this.config[entityKey]];
      if (!s || s.state === 'unavailable' || s.state === 'unknown') return fallback;
      const v = parseFloat(s.state);
      return (!isNaN(v)) ? v : fallback;
    };

    // Read the HA unit_of_measurement for a custom entity key.
    const _readUnit = (entityKey) =>
      this._hass?.states[this.config[entityKey]]?.attributes?.unit_of_measurement || '';

    // Smart value formatter: respects the entity's own unit.
    //   W / kW  → auto-range to kW at ≥1000 W
    //   V       → 3 decimal places
    //   °C / °F → 1 decimal place
    //   %       → 1 decimal place
    //   kWh / Wh / MWh → 2 decimal places
    //   anything else  → 2 decimal places
    // Also returns a colour appropriate for the unit.
    const _fmtCustom = (val, unit) => {
      const u = (unit || '').trim();
      let text, color;
      if (u === 'W') {
        if (Math.abs(val) >= 1000) { text = (val / 1000).toFixed(2) + ' kW'; }
        else                        { text = val.toFixed(0) + ' W'; }
        color = '#58a6ff';
      } else if (u === 'kW') {
        text = val.toFixed(2) + ' kW';
        color = '#58a6ff';
      } else if (u === 'V') {
        text = val.toFixed(3) + ' V';
        color = this._cellVoltColor(val);
      } else if (u === '°C' || u === '°F' || u === 'C' || u === 'F') {
        text = val.toFixed(1) + ' ' + (u.startsWith('°') ? u : '°' + u);
        color = this._cellTempColor(val);
      } else if (u === '%') {
        text = val.toFixed(1) + ' %';
        color = this._socColor(val);
      } else if (u === 'kWh' || u === 'Wh' || u === 'MWh') {
        text = val.toFixed(2) + ' ' + u;
        color = '#f4d03f';
      } else if (u === 'A') {
        text = val.toFixed(1) + ' A';
        color = '#cde';
      } else {
        // Unknown unit — show value + unit as-is
        text = val.toFixed(2) + (u ? ' ' + u : '');
        color = '#cde';
      }
      return { text, color };
    };

    const pvBlocks = getEl('pvBlocks');
    // Fix #11: guard pvBlocks rebuild (was regenerating 20 divs on every state update)
    if (pvBlocks && pvTotal !== this._prevPvBlocksTotal) {
      this._prevPvBlocksTotal = pvTotal;
      const lit = Math.round((pvTotal / pvMax) * 20); const heights = [20, 35, 50, 60, 70, 80, 90, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]; let html = ''; for (let i = 0; i < 20; i++) html += `<div style="flex:1;background:${i < lit ? 'rgba(255,255,255,0.55)' : '#21262d'};height:${i < lit ? heights[i] : 100}%;opacity:${i < lit ? 1 : 0.35};border-radius:2px;"></div>`; pvBlocks.innerHTML = html;
    }

    // EV
    const evGroup = getEl('evGroup');
    if (evGroup) {
      if (!this.config._show_ev) {
        evGroup.style.display = 'none';
        // Fix #12: removed early return here — was silently skipping any code added after this block
      } else {
      evGroup.style.display = '';
      const isChargingEV = chargerStateStr === 'charging';
      const isCompleted = chargerStateStr === 'completed' || chargerStateStr === 'finished';
      const evFlow = getEl('flowHomeEV');
      const evIcon = getEl('evIconImg');
      if (evFlow) {
        if (isChargingEV) {
          evFlow.setAttribute('opacity', '0.9'); evFlow.setAttribute('stroke', '#2b59ff');
          // Fix #6: always reset opacity before applying filter (was stuck at 0.3 if previously disconnected)
          if (evIcon) { evIcon.style.opacity = '1'; evIcon.setAttribute('filter', 'url(#iconGlowOrange)'); }
        } else if (isCompleted) {
          evFlow.setAttribute('opacity', '0');
          if (evIcon) { evIcon.style.opacity = '1'; evIcon.setAttribute('filter', 'url(#iconGlowGreen)'); }
        } else {
          evFlow.setAttribute('opacity', '0');
          if (evIcon) { evIcon.setAttribute('filter', ''); evIcon.style.opacity = '0.3'; }
        }
      }
      if (isChargingEV || isCompleted) {
        setText('evPowerVal', chargerPower.toFixed(0) + ' W');
        setText('evCurrentVal', chargerCurrent.toFixed(1) + ' A');
        setText('evSocVal', chargerSoc.toFixed(0) + ' %');
        let evEta = '--';
        if (isChargingEV) {
          if (chargerEtaSensor !== null && !isNaN(chargerEtaSensor)) evEta = this._fmtTime(chargerEtaSensor / 60);
          else if (chargerBattCapWh && chargerSoc > 0 && chargerPower > 0) {
            const remainingWh = chargerBattCapWh * (100 - chargerSoc) / 100;
            const hours = remainingWh / chargerPower;
            evEta = this._fmtTime(hours);
          }
        } else if (isCompleted) {
          evEta = 'Full';
        }
        setText('evEtaVal', evEta);
      } else {
        setText('evPowerVal', '-- W');
        setText('evCurrentVal', '-- A');
        setText('evSocVal', '-- %');
        setText('evEtaVal', '--');
      }
      } // end else (_show_ev)
    }
  }
}
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'rdp-flow-card',
  name: 'K-Flow Card',
  description: 'Real-time solar/battery/grid energy flow card with animated power paths, dual-battery support, EV charger integration, and per-tile label overrides.',
  preview: true,
  version: '1.0.2',
});
customElements.define('rdp-flow-card', RdpFlowCard);
