/* ============================================================
   Annotations.

   A note pinned to an anatomical ID (or to a bare world point when the user
   clicks empty space). Because the anchor is an ID and a local offset rather
   than a camera position or a vertex index, an annotation reloads onto the
   same tissue even if the geometry is retessellated or the build order
   changes — which is the whole point of the identity layer.

   Rendered as DOM labels with a leader line to the anchor. One extra draw
   call for all leader lines together.
   ============================================================ */

import * as THREE from 'three';
import { make } from '../core/util.js';
import { entitlements } from '../platform/entitlements.js';

const MAX_NOTES = 96;

export class Annotations {
  constructor({ registry, solver, camera, canvas, overlayHost, onSelect }) {
    this.registry = registry;
    this.solver = solver;
    this.camera = camera;
    this.canvas = canvas;
    this.host = overlayHost;
    this.onSelect = onSelect;

    this.items = [];
    this._seq = 0;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_NOTES * 6), 3));
    geom.setDrawRange(0, 0);
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3);
    this._pos = geom.getAttribute('position');
    this.lines = new THREE.LineSegments(
      geom,
      new THREE.LineBasicMaterial({ color: 0xf0b429, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false })
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 29;

    this.group = new THREE.Group();
    this.group.name = 'annotations';
    this.group.add(this.lines);

    this._w = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  get count() {
    return this.items.length;
  }

  add({ point, structure, text = '', title = '' }) {
    if (!entitlements.require('tool.annotate')) return null;
    if (this.items.length >= MAX_NOTES) return null;
    const id = `a${++this._seq}`;
    const anchor = structure
      ? { id: structure.id, offset: point.clone().sub(structure.center), node: this.solver.nearest(point) }
      : { id: null, offset: point.clone(), node: this.solver.nearest(point) };

    const item = {
      id,
      anchor,
      targetName: structure?.name || 'Region',
      targetId: structure?.id || null,
      title: title || structure?.name || 'Note',
      text,
      // screen-space nudge so overlapping notes can be pulled apart
      offsetPx: { x: 24, y: -28 },
      el: null,
      editing: !text,
    };
    item.el = make('div', 'anno');
    this.host.appendChild(item.el);
    this._bind(item);
    this.items.push(item);
    this._render(item);
    return item;
  }

  _bind(item) {
    const el = item.el;
    // drag the label to reposition it in screen space
    let dragging = false;
    let sx = 0;
    let sy = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.anno-x') || e.target.closest('textarea')) return;
      dragging = true;
      sx = e.clientX - item.offsetPx.x;
      sy = e.clientY - item.offsetPx.y;
      el.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      item.offsetPx.x = e.clientX - sx;
      item.offsetPx.y = e.clientY - sy;
    });
    el.addEventListener('pointerup', (e) => {
      dragging = false;
      el.releasePointerCapture?.(e.pointerId);
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('.anno-x')) {
        this.remove(item.id);
        return;
      }
      if (item.targetId) this.onSelect?.(item.targetId);
      e.stopPropagation();
    });
  }

  _render(item) {
    const el = item.el;
    if (item.editing) {
      el.classList.add('anno-editing');
      el.innerHTML = `
        <button class="anno-x" title="Delete">×</button>
        <div class="anno-target">${item.targetName}</div>
        <textarea class="anno-input" rows="2" placeholder="Note…"></textarea>
        <div class="anno-actions"><button class="anno-save">Save</button></div>`;
      const ta = el.querySelector('textarea');
      ta.value = item.text;
      requestAnimationFrame(() => ta.focus());
      const commit = () => {
        item.text = ta.value.trim();
        item.editing = false;
        if (!item.text) this.remove(item.id);
        else this._render(item);
      };
      el.querySelector('.anno-save').addEventListener('click', commit);
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
        if (e.key === 'Escape') {
          item.editing = false;
          if (!item.text) this.remove(item.id);
          else this._render(item);
        }
        e.stopPropagation();
      });
    } else {
      el.classList.remove('anno-editing');
      el.innerHTML = `
        <button class="anno-x" title="Delete">×</button>
        <div class="anno-target">${item.targetName}</div>
        <div class="anno-text"></div>`;
      el.querySelector('.anno-text').textContent = item.text;
      el.querySelector('.anno-text').addEventListener('dblclick', (e) => {
        item.editing = true;
        this._render(item);
        e.stopPropagation();
      });
    }
  }

  remove(id) {
    const i = this.items.findIndex((a) => a.id === id);
    if (i < 0) return;
    this.items[i].el?.remove();
    this.items.splice(i, 1);
  }

  clear() {
    for (const a of this.items) a.el?.remove();
    this.items.length = 0;
  }

  setVisible(v) {
    this.group.visible = v;
    for (const a of this.items) if (a.el) a.el.style.display = v ? '' : 'none';
  }

  _anchorWorld(anchor, out) {
    const s = anchor.id ? this.registry.byAnatomicalId(anchor.id) : null;
    if (s) out.copy(s.center).add(anchor.offset);
    else out.copy(anchor.offset);
    const n = anchor.node;
    if (n >= 0) {
      out.x += this.solver.pos[n * 3] - this.solver.home[n * 3];
      out.y += this.solver.pos[n * 3 + 1] - this.solver.home[n * 3 + 1];
      out.z += this.solver.pos[n * 3 + 2] - this.solver.home[n * 3 + 2];
    }
    return out;
  }

  update() {
    if (!this.group.visible) return;
    const arr = this._pos.array;
    let n = 0;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;

    for (const a of this.items) {
      this._anchorWorld(a.anchor, this._w);
      this._p.copy(this._w).project(this.camera);
      const behind = this._p.z > 1 || this._p.z < -1;
      const x = (this._p.x * 0.5 + 0.5) * W;
      const y = (-this._p.y * 0.5 + 0.5) * H;
      if (behind || x < -200 || y < -140 || x > W + 200 || y > H + 140) {
        a.el.style.display = 'none';
        continue;
      }
      a.el.style.display = '';
      a.el.style.transform = `translate(${Math.round(x + a.offsetPx.x)}px, ${Math.round(y + a.offsetPx.y)}px)`;

      // leader line from the anchor toward the label, in world space along the
      // camera's right/up basis so it always points the right way
      const px = a.offsetPx.x / W;
      const py = -a.offsetPx.y / H;
      const dist = this.camera.position.distanceTo(this._w);
      const f = (this.camera.fov * Math.PI) / 180;
      const spanH = 2 * dist * Math.tan(f / 2);
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
      const end = this._w.clone().addScaledVector(right, px * spanH * this.camera.aspect).addScaledVector(up, py * spanH);
      const o = n * 6;
      arr[o] = this._w.x;
      arr[o + 1] = this._w.y;
      arr[o + 2] = this._w.z;
      arr[o + 3] = end.x;
      arr[o + 4] = end.y;
      arr[o + 5] = end.z;
      n++;
    }
    this._pos.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, n * 2);
  }

  serialise() {
    return this.items.map((a) => ({
      id: a.id,
      anchor: { id: a.anchor.id, offset: a.anchor.offset.toArray(), node: a.anchor.node },
      targetName: a.targetName,
      targetId: a.targetId,
      title: a.title,
      text: a.text,
      offsetPx: { ...a.offsetPx },
    }));
  }

  restore(list) {
    this.clear();
    for (const raw of list || []) {
      const item = {
        id: raw.id,
        anchor: {
          id: raw.anchor.id,
          offset: new THREE.Vector3().fromArray(raw.anchor.offset),
          node: raw.anchor.node ?? -1,
        },
        targetName: raw.targetName,
        targetId: raw.targetId,
        title: raw.title,
        text: raw.text,
        offsetPx: raw.offsetPx || { x: 24, y: -28 },
        el: make('div', 'anno'),
        editing: false,
      };
      this.host.appendChild(item.el);
      this._bind(item);
      this.items.push(item);
      this._render(item);
      this._seq = Math.max(this._seq, parseInt(String(raw.id).slice(1), 10) || 0);
    }
  }

  dispose() {
    this.clear();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
