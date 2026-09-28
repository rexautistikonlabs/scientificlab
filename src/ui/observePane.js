/* CONTINUUM — Copyright © 2026 RexMetrix Technologies, LLC. All rights reserved.
   Proprietary and confidential. Not a medical device; not for diagnostic use.
   See PROPRIETARY_NOTICE.md. */

/* ============================================================
   Under Observation pane — the current focus, its live model
   values, the selected teaching point, and session notes.

   REC is session notes only: timestamped free text kept in this
   browser, exportable with a project. It is not clinical
   recording, and the pane says so.
   ============================================================ */

import { el, make, clamp } from '../core/util.js';
import { RECEPTORS } from '../anatomy/info.js';

const NOTES_KEY = 'continuum.sessionNotes.v1';

export class ObservePane {
  constructor({ store, registry, solver, afferent, teaching }) {
    this.store = store;
    this.registry = registry;
    this.solver = solver;
    this.afferent = afferent;
    this.teaching = teaching;

    this.host = el('#observe-body');
    if (!this.host) return;
    this._build();
    store.on('selection', () => this._syncSubject());
    this._syncSubject();
  }

  _build() {
    const h = this.host;
    h.innerHTML = '';

    this.subjectEl = make('div', 'obs-subject');
    h.appendChild(this.subjectEl);

    this.sparkCanvas = document.createElement('canvas');
    this.sparkCanvas.className = 'obs-spark';
    this.sparkCanvas.height = 34;
    this.sparkCanvas.title = 'Local tension deviation at the observed structure — model output';
    h.appendChild(this.sparkCanvas);
    this._sparkC = this.sparkCanvas.getContext('2d');
    this._sparkBuf = new Float32Array(140);
    this._sparkN = 0;
    this._acc = 0;

    /* notes */
    const noteHead = make('div', 'obs-notehead');
    this.recBtn = make('button', 'mini rec', 'REC');
    this.recBtn.title = 'Session notes only — timestamped free text kept in this browser. Not clinical recording.';
    this.recBtn.addEventListener('click', () => {
      this._rec = !this._rec;
      this.recBtn.classList.toggle('on', this._rec);
      this.noteInput.hidden = !this._rec;
      if (this._rec) this.noteInput.focus();
    });
    noteHead.appendChild(this.recBtn);
    noteHead.appendChild(make('span', 'obs-notelabel', 'session notes · local only'));
    h.appendChild(noteHead);

    this.noteInput = document.createElement('input');
    this.noteInput.type = 'text';
    this.noteInput.placeholder = 'note + Enter';
    this.noteInput.className = 'obs-noteinput';
    this.noteInput.hidden = true;
    this.noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.noteInput.value.trim()) {
        this._addNote(this.noteInput.value.trim());
        this.noteInput.value = '';
      }
      e.stopPropagation();
    });
    h.appendChild(this.noteInput);

    this.noteList = make('div', 'obs-notes');
    h.appendChild(this.noteList);
    this._renderNotes();
  }

  _notes() {
    try {
      return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    } catch {
      return [];
    }
  }

  _addNote(text) {
    const notes = this._notes();
    const sel = [...this.store.selection][0];
    const s = sel ? this.registry.get(sel) : null;
    notes.unshift({ at: new Date().toISOString(), subject: s?.name || null, text });
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes.slice(0, 60)));
    } catch {
      /* storage unavailable — the note simply does not persist */
    }
    this._renderNotes();
  }

  _renderNotes() {
    const notes = this._notes().slice(0, 6);
    this.noteList.innerHTML = notes.length
      ? notes
          .map(
            (n) =>
              `<div class="obs-note"><b>${new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>${
                n.subject ? `<i>${n.subject}</i>` : ''
              }<span>${n.text.replace(/</g, '&lt;')}</span></div>`
          )
          .join('')
      : '<div class="obs-note obs-empty">no notes this session</div>';
  }

  _syncSubject() {
    const sel = [...this.store.selection];
    const s = sel.length ? this.registry.get(sel[0]) : null;
    this._subject = s || null;
    if (!s) {
      this.subjectEl.innerHTML = `<p class="obs-empty">Click a structure, a receptor field, or a teaching point.</p>`;
      return;
    }
    const layer = this.store.layer(s.layer);
    const recs = (s.receptors || [])
      .map((id) => RECEPTORS[id])
      .filter(Boolean)
      .map((r) => `<i style="color:${r.color}" title="${r.name}">${r.short}</i>`)
      .join('');
    const tp = this.teaching.selected
      ? this.teaching.resolved[this.teaching.selected.system]?.[this.teaching.selected.index]
      : null;
    this.subjectEl.innerHTML = `
      <div class="obs-name"><span class="obs-dot" style="background:${layer?.color || '#888'}"></span>
        <b>${s.name}</b><em>${layer?.name || s.layer}</em></div>
      <div class="obs-live" id="obs-live">—</div>
      ${recs ? `<div class="obs-recs">${recs}</div>` : ''}
      ${tp ? `<div class="obs-point">◆ ${tp.point.name} · ${tp.point.confidence}</div>` : ''}`;
    this.liveEl = this.subjectEl.querySelector('#obs-live');
  }

  update(dt) {
    if (!this.host) return;
    this._acc += dt;
    if (this._acc < 0.2) return;
    this._acc = 0;

    const s = this._subject;
    if (s && this.liveEl) {
      const st = this.registry.stateOf(s);
      const text = `tension ${st.dev >= 0 ? '+' : ''}${(st.dev * 100).toFixed(0)} % · stiffened +${(st.stiffness * 100).toFixed(0)} % · pressure ${(st.pressure * 100).toFixed(0)} %`;
      if (this.liveEl.textContent !== text) this.liveEl.textContent = text;

      /* local tension sparkline */
      const buf = this._sparkBuf;
      buf.copyWithin(0, 1);
      buf[buf.length - 1] = clamp(Math.abs(st.dev) * 2 + st.stiffness, 0, 1);
      this._sparkN = Math.min(this._sparkN + 1, buf.length);
      const c = this._sparkC;
      const W = (this.sparkCanvas.width = this.sparkCanvas.clientWidth || 220);
      const H = this.sparkCanvas.height;
      c.clearRect(0, 0, W, H);
      c.strokeStyle = '#b5651d';
      c.lineWidth = 1.4;
      c.beginPath();
      const n = this._sparkN;
      for (let k = 0; k < n; k++) {
        const v = buf[buf.length - n + k];
        const x = (k / (buf.length - 1)) * W;
        const y = H - 2 - v * (H - 6);
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  }
}
