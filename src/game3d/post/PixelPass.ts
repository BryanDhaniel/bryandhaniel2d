import { Pass } from "postprocessing";
import * as THREE from "three";
import { PIXEL_MODE } from "@/game3d/config/visuals";
import { linearRgb } from "@/game3d/lighting/DayNightCycle";

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 lowSize;
uniform vec3 outlineColor;
uniform float outlineStrength;
uniform float outlineDepth;
uniform float cameraNear;
uniform float cameraFar;
uniform float perspective;
varying vec2 vUv;

float depthAt(ivec2 p) {
  p = clamp(p, ivec2(0), ivec2(lowSize) - 1);
  float d = texelFetch(tDepth, p, 0).r;
  // Orthographic depth is linear; perspective depth is hyperbolic.
  float linear = cameraNear + d * (cameraFar - cameraNear);
  float hyperbolic = (cameraNear * cameraFar) / (cameraFar - d * (cameraFar - cameraNear));
  return mix(linear, hyperbolic, perspective);
}

void main() {
  ivec2 p = ivec2(floor(vUv * lowSize));
  vec4 color = texelFetch(tColor, p, 0);
  float d = depthAt(p);
  float step1 = max(d - depthAt(p + ivec2(1, 0)), d - depthAt(p - ivec2(1, 0)));
  float step2 = max(d - depthAt(p + ivec2(0, 1)), d - depthAt(p - ivec2(0, 1)));
  float edge = step(outlineDepth, max(step1, step2));
  color.rgb = mix(color.rgb, outlineColor, edge * outlineStrength);
  gl_FragColor = color;
}
`;

/**
 * Pixel mode's scene pass: renders the world into a low-resolution target (at most
 * PIXEL_MODE.maxHeight pixels tall, scaled up by a whole number), draws a one-pixel outline
 * wherever something stands in front of what is behind it, and upscales with nearest
 * sampling into the composer. Bloom and grading then run at full resolution, so the pixels
 * stay sharp while the glow stays soft.
 */
export class PixelRenderPass extends Pass {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;

  private worldCamera: THREE.Camera;

  constructor(
    private readonly worldScene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    super("PixelRenderPass");
    this.worldCamera = camera;
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        lowSize: { value: new THREE.Vector2(1, 1) },
        outlineColor: { value: new THREE.Color(...linearRgb(PIXEL_MODE.outlineColor)) },
        outlineStrength: { value: PIXEL_MODE.outlineStrength },
        outlineDepth: { value: PIXEL_MODE.outlineDepth },
        cameraNear: { value: 1 },
        cameraFar: { value: 100 },
        perspective: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.fullscreenMaterial = this.material;
  }

  override render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget | null,
  ): void {
    const camera = this.worldCamera;
    if (camera instanceof THREE.OrthographicCamera || camera instanceof THREE.PerspectiveCamera) {
      const uniforms = this.material.uniforms;
      if (uniforms.cameraNear) uniforms.cameraNear.value = camera.near;
      if (uniforms.cameraFar) uniforms.cameraFar.value = camera.far;
      if (uniforms.perspective)
        uniforms.perspective.value = camera instanceof THREE.PerspectiveCamera ? 1 : 0;
    }
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.worldScene, camera);
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    renderer.render(this.scene, this.camera);
  }

  override set mainCamera(camera: THREE.Camera) {
    this.worldCamera = camera;
  }

  override setSize(width: number, height: number): void {
    const scale = Math.max(PIXEL_MODE.minScale, Math.ceil(height / PIXEL_MODE.maxHeight));
    const w = Math.max(1, Math.floor(width / scale));
    const h = Math.max(1, Math.floor(height / scale));
    this.target.setSize(w, h);
    const lowSize = this.material.uniforms.lowSize?.value;
    if (lowSize instanceof THREE.Vector2) lowSize.set(w, h);
  }

  override dispose(): void {
    super.dispose();
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
  }
}
