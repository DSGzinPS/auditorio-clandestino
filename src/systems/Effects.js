// Efeitos visuais curtos: traçante da bala, faísca/poeira no impacto, clarão de explosão.
// No modo rede, o host manda esses eventos para o convidado desenhar também.

import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.onEmit = null; // (tipo, dados) → rede
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9 });
    this.sparkGeo = new THREE.SphereGeometry(1, 6, 4);
    this.flashGeo = new THREE.SphereGeometry(1, 16, 10);
    // uma luz fixa reaproveitada: criar luz nova a cada explosão recompila os shaders (travada)
    this.light = new THREE.PointLight(0xff8a2b, 0, 12, 2);
    this.light.position.set(0, -50, 0);
    scene.add(this.light);
  }

  tracer(from, to, color = 0xfff1a8) {
    this.onEmit?.('tracer', { from: v3(from), to: v3(to), color });
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z)]);
    const mat = this.tracerMat.clone();
    mat.color.setHex(color);
    const line = new THREE.Line(geo, mat);
    this._add(line, 0.07, (k) => { mat.opacity = 0.9 * (1 - k); }, true);
  }

  impact(at, normal, color = 0xd8d0b0) {
    this.onEmit?.('impact', { at: v3(at), color });
    const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    m.position.set(at.x, at.y, at.z);
    m.scale.setScalar(0.05);
    this._add(m, 0.25, (k) => { m.scale.setScalar(0.05 + k * 0.12); m.material.opacity = 0.85 * (1 - k); });
  }

  explosion(at, radius = 4) {
    this.onEmit?.('explosion', { at: v3(at), radius });
    const m = new THREE.Mesh(this.flashGeo, new THREE.MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.85 }));
    m.position.set(at.x, at.y, at.z);
    const light = this.light;
    light.position.copy(m.position);
    light.distance = radius * 3;
    this._add(m, 0.4, (k) => {
      m.scale.setScalar(0.3 + k * radius);
      m.material.opacity = 0.85 * (1 - k);
      light.intensity = 40 * (1 - k);
    });
  }

  /** Aplica um efeito recebido pela rede (convidado). */
  replay(kind, d) {
    const save = this.onEmit;
    this.onEmit = null;
    if (kind === 'tracer') this.tracer(d.from, d.to, d.color);
    else if (kind === 'impact') this.impact(d.at, null, d.color);
    else if (kind === 'explosion') this.explosion(d.at, d.radius);
    this.onEmit = save;
  }

  _add(obj, life, tick, ownGeo = false) {
    this.scene.add(obj);
    this.items.push({ obj, life, t: 0, tick, ownGeo });
  }

  update(dt) {
    for (const e of [...this.items]) {
      e.t += dt;
      const k = Math.min(1, e.t / e.life);
      e.tick?.(k);
      if (k >= 1) {
        this.scene.remove(e.obj);
        if (e.ownGeo) e.obj.geometry?.dispose?.();
        e.obj.material?.dispose?.();
        this.items.splice(this.items.indexOf(e), 1);
      }
    }
  }
}

const v3 = (v) => ({ x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) });
