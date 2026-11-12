// Renderiza N câmeras lado a lado (tela dividida vertical para o 1v1 local).

import * as THREE from 'three';

export class SplitScreenRenderer {
  /** @param opts.lowPower celular: menos pixels e sombra mais simples */
  constructor(container, { lowPower = false } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.25 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = lowPower ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    window.addEventListener('resize', () => this.renderer.setSize(window.innerWidth, window.innerHeight));
  }

  get domElement() {
    return this.renderer.domElement;
  }

  render(scene, cameras) {
    const r = this.renderer;
    const w = window.innerWidth, h = window.innerHeight;
    const vw = Math.floor(w / cameras.length);
    r.setScissorTest(true);
    cameras.forEach((cam, i) => {
      const x = i * vw;
      r.setViewport(x, 0, vw, h);
      r.setScissor(x, 0, vw, h);
      cam.aspect = vw / h;
      cam.updateProjectionMatrix();
      r.render(scene, cam);
    });
    r.setScissorTest(false);
  }
}
