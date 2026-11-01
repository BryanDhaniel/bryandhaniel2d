/**
 * GLSL ES 1.0 sources for the world and post-processing pipelines.
 *
 * The world is rendered into a low-resolution canvas (one canvas pixel per world texel), so
 * every effect here works in whole texels: lighting is evaluated at texel centres, offsets are
 * rounded, and the browser upscales the result with nearest-neighbour.
 */

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

// ---------------------------------------------------------------------------------------------
// World vertex shader (shared by lit and unlit pipelines; WIND bends sprites in the breeze)
// ---------------------------------------------------------------------------------------------

function worldVertex(wind: boolean): string {
  return `#define SHADER_NAME VILLAGE_WORLD_VS${wind ? "\n#define WIND" : ""}
precision mediump float;

uniform mat4 uProjectionMatrix;
uniform float uTime;
uniform float uWindAmp;
uniform float uWindSpeed;
uniform float uWindGust;

attribute vec2 inPosition;
attribute vec2 inTexCoord;
attribute float inTexId;
attribute float inTintEffect;
attribute vec4 inTint;

varying vec2 outTexCoord;
varying float outTexId;
varying float outTintEffect;
varying vec4 outTint;
varying vec2 outScreen;

void main ()
{
    vec2 position = inPosition;
#ifdef WIND
    // The tint carries a per-sprite phase (grey level); the colour itself is not used.
    float phase = inTint.r * 6.2831853;
    float weight = 1.0 - inTexCoord.y;
    weight *= weight;
    float sway = sin(uTime * uWindSpeed + phase) * uWindAmp
        + sin(uTime * uWindSpeed * 2.7 + phase * 1.7) * uWindAmp * uWindGust;
    // Whole-texel offsets keep the bend on the pixel grid.
    position.x += floor(sway * weight + 0.5);
    outTint = vec4(1.0, 1.0, 1.0, inTint.a);
#else
    outTint = inTint;
#endif
    gl_Position = uProjectionMatrix * vec4(position, 1.0, 1.0);
    outScreen = position;
    outTexCoord = inTexCoord;
    outTexId = inTexId;
    outTintEffect = inTintEffect;
}
`;
}

export const WORLD_VERTEX = worldVertex(false);
export const WIND_VERTEX = worldVertex(true);

// ---------------------------------------------------------------------------------------------
// Lit fragment shader: ambient + banded point lights with normal maps
// ---------------------------------------------------------------------------------------------

export const LIT_FRAGMENT = `#define SHADER_NAME VILLAGE_LIT_FS
${PRECISION}
const int kMaxLights = %LIGHT_COUNT%;

uniform sampler2D uMainSampler;
uniform sampler2D uNormSampler;
uniform mat3 uInverseRotationMatrix;
uniform vec3 uAmbient;
// xy = position in canvas texels (y down), z = radius, w = intensity
uniform vec4 uLights[kMaxLights];
uniform vec3 uLightColors[kMaxLights];
uniform int uLightCount;
uniform float uLightBands;
uniform float uLightHeight;
uniform float uNormalYSign;

varying vec2 outTexCoord;
varying float outTexId;
varying float outTintEffect;
varying vec4 outTint;
varying vec2 outScreen;

void main ()
{
    vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
    vec4 texture = texture2D(uMainSampler, outTexCoord);
    vec4 color = texture * texel;
    if (outTintEffect == 1.0)
    {
        color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);
    }
    else if (outTintEffect == 2.0)
    {
        color = texel;
    }

    vec3 n = texture2D(uNormSampler, outTexCoord).rgb * 2.0 - 1.0;
    n.y *= uNormalYSign;
    vec3 normal = normalize(uInverseRotationMatrix * n);

    // Light each texel at its centre so the shading snaps to the pixel grid.
    vec2 fragment = floor(outScreen) + 0.5;
    vec3 light = uAmbient;
    for (int i = 0; i < kMaxLights; ++i)
    {
        if (i < uLightCount)
        {
            vec4 source = uLights[i];
            vec2 delta = source.xy - fragment;
            float distanceSq = dot(delta, delta);
            float attenuation = clamp(1.0 - distanceSq / (source.z * source.z), 0.0, 1.0);
            if (uLightBands > 0.0)
            {
                attenuation = ceil(attenuation * uLightBands) / uLightBands;
            }
            vec3 direction = normalize(vec3(delta, uLightHeight));
            float diffuse = max(dot(normal, direction), 0.0);
            light += uLightColors[i] * (diffuse * attenuation * source.w);
        }
    }
    gl_FragColor = color * vec4(light, 1.0);
}
`;

// ---------------------------------------------------------------------------------------------
// Unlit fragment shader: Phaser's multi-texture batch, multiplied by the ambient colour
// ---------------------------------------------------------------------------------------------

export const UNLIT_FRAGMENT = `#define SHADER_NAME VILLAGE_UNLIT_FS
${PRECISION}
uniform sampler2D uMainSampler[%count%];
uniform vec3 uAmbient;

varying vec2 outTexCoord;
varying float outTexId;
varying float outTintEffect;
varying vec4 outTint;
varying vec2 outScreen;

void main ()
{
    vec4 texture;
    %forloop%
    vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
    vec4 color = texture * texel;
    if (outTintEffect == 1.0)
    {
        color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);
    }
    else if (outTintEffect == 2.0)
    {
        color = texel;
    }
    gl_FragColor = color * vec4(uAmbient, 1.0);
}
`;

// ---------------------------------------------------------------------------------------------
// Post-processing (full-screen quads; outTexCoord has y = 0 at the bottom)
// ---------------------------------------------------------------------------------------------

const POST_COMMON = `${PRECISION}
varying vec2 outTexCoord;

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
`;

/**
 * Water: animated ripple highlights, specular sparkles and screen-space reflections. The mask
 * texture (world-sized) holds R = water, G = texels below the shoreline, B = puddle.
 */
export const WATER_FRAGMENT = `#define SHADER_NAME VILLAGE_WATER_FS
${POST_COMMON}
uniform sampler2D uMainSampler;
uniform sampler2D uMaskSampler;
uniform vec2 uResolution;
uniform vec2 uScroll;
uniform vec2 uWorldSize;
uniform float uTime;
uniform float uReflect;
uniform float uReach;
uniform float uWobble;
uniform float uRipple;
uniform float uSparkle;
uniform float uPuddles;
uniform float uDaylight;
uniform vec3 uSkyTint;
uniform vec3 uSparkColor;

vec2 sceneUV(vec2 px)
{
    return vec2((px.x + 0.5) / uResolution.x, 1.0 - (px.y + 0.5) / uResolution.y);
}

vec4 maskAt(vec2 world)
{
    return texture2D(uMaskSampler, (world + 0.5) / uWorldSize);
}

void main ()
{
    vec4 color = texture2D(uMainSampler, outTexCoord);
    vec2 px = floor(vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uResolution);
    vec2 world = px + uScroll;
    if (world.x < 0.0 || world.y < 0.0 || world.x >= uWorldSize.x || world.y >= uWorldSize.y)
    {
        gl_FragColor = color;
        return;
    }
    vec4 mask = maskAt(world);
    float puddle = mask.b * uPuddles;
    if (mask.r < 0.5 && puddle < 0.02)
    {
        gl_FragColor = color;
        return;
    }
    vec3 result = color.rgb;
    if (mask.r >= 0.5)
    {
        float depth = floor(mask.g * 255.0 + 0.5);
        if (uReflect > 0.0)
        {
            float wobble = floor(sin(world.y * 0.85 + uTime * uRipple) * uWobble + 0.5);
            vec2 source = vec2(px.x + wobble, px.y - 2.0 * depth - 1.0);
            if (source.y >= 0.0 && source.x >= 0.0 && source.x < uResolution.x)
            {
                float sourceIsWater = maskAt(source + uScroll).r;
                float fade = (1.0 - clamp(depth / uReach, 0.0, 1.0)) * (1.0 - sourceIsWater);
                vec3 reflection = texture2D(uMainSampler, sceneUV(source)).rgb * uSkyTint;
                result = mix(result, reflection, uReflect * fade);
            }
        }
        float band = sin(world.y * 1.7 + uTime * uRipple * 1.3 + sin(world.x * 0.21 + uTime * 0.7) * 2.0);
        if (band > 0.94)
        {
            result += vec3(0.05);
        }
        if (hash(world + floor(uTime * 6.0)) > uSparkle)
        {
            result = mix(result, uSparkColor, 0.15 + 0.7 * uDaylight);
        }
    }
    else
    {
        vec2 source = vec2(px.x, max(px.y - 3.0, 0.0));
        vec3 reflection = texture2D(uMainSampler, sceneUV(source)).rgb * uSkyTint;
        result = mix(result, mix(result * 0.72, reflection, 0.5), puddle * 0.8);
        if (hash(floor(world * 0.5) + floor(uTime * 8.0)) > 0.982)
        {
            result += uSparkColor * 0.3 * puddle;
        }
    }
    gl_FragColor = vec4(result, color.a);
}
`;

/** Keeps only bright pixels (soft threshold) for the bloom. */
export const BRIGHT_FRAGMENT = `#define SHADER_NAME VILLAGE_BRIGHT_FS
${POST_COMMON}
uniform sampler2D uMainSampler;
uniform float uThreshold;
uniform float uKnee;

void main ()
{
    vec3 color = texture2D(uMainSampler, outTexCoord).rgb;
    float brightness = dot(color, vec3(0.299, 0.587, 0.114));
    float weight = smoothstep(uThreshold - uKnee, uThreshold + uKnee, brightness);
    gl_FragColor = vec4(color * weight, 1.0);
}
`;

/** Separable 5-tap Gaussian blur. */
export const BLUR_FRAGMENT = `#define SHADER_NAME VILLAGE_BLUR_FS
${POST_COMMON}
uniform sampler2D uMainSampler;
uniform vec2 uDirection;

void main ()
{
    vec2 offset = uDirection;
    vec3 sum = texture2D(uMainSampler, outTexCoord).rgb * 0.227027;
    sum += texture2D(uMainSampler, outTexCoord + offset * 1.384615).rgb * 0.316216;
    sum += texture2D(uMainSampler, outTexCoord - offset * 1.384615).rgb * 0.316216;
    sum += texture2D(uMainSampler, outTexCoord + offset * 3.230769).rgb * 0.070270;
    sum += texture2D(uMainSampler, outTexCoord - offset * 3.230769).rgb * 0.070270;
    gl_FragColor = vec4(sum, 1.0);
}
`;

/** Bloom add, time-of-day colour grade and an ordered-dither vignette. */
export const COMPOSITE_FRAGMENT = `#define SHADER_NAME VILLAGE_COMPOSITE_FS
${POST_COMMON}
uniform sampler2D uMainSampler;
uniform sampler2D uBloomSampler;
uniform vec2 uResolution;
uniform float uBloomStrength;
uniform vec3 uGradeTint;
uniform float uGradeStrength;
uniform float uSaturation;
uniform float uContrast;
uniform float uBrightness;
uniform float uVignette;
uniform float uVignetteLevels;

float bayer(vec2 p)
{
    vec2 q = mod(p, 4.0);
    float i = q.y * 4.0 + q.x;
    // 4x4 Bayer matrix, row-major.
    if (i < 0.5) return 0.0; if (i < 1.5) return 8.0; if (i < 2.5) return 2.0; if (i < 3.5) return 10.0;
    if (i < 4.5) return 12.0; if (i < 5.5) return 4.0; if (i < 6.5) return 14.0; if (i < 7.5) return 6.0;
    if (i < 8.5) return 3.0; if (i < 9.5) return 11.0; if (i < 10.5) return 1.0; if (i < 11.5) return 9.0;
    if (i < 12.5) return 15.0; if (i < 13.5) return 7.0; if (i < 14.5) return 13.0; return 5.0;
}

void main ()
{
    vec3 color = texture2D(uMainSampler, outTexCoord).rgb;
    color += texture2D(uBloomSampler, outTexCoord).rgb * uBloomStrength;

    color = mix(color, color * uGradeTint * 1.45, uGradeStrength);
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, uSaturation);
    color = (color - 0.5) * uContrast + 0.5;
    color *= uBrightness;

    vec2 px = floor(vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uResolution);
    vec2 centred = (outTexCoord - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    float amount = smoothstep(0.45, 1.0, length(centred)) * uVignette;
    float level = floor(amount * uVignetteLevels + (bayer(px) + 0.5) / 16.0) / uVignetteLevels;
    color *= 1.0 - level;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

/** Optional CRT / film look: grain, alternate-row scanlines, convergence error, rolling band. */
export const RETRO_FRAGMENT = `#define SHADER_NAME VILLAGE_RETRO_FS
${POST_COMMON}
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uGrain;
uniform float uScanlines;
uniform float uAberration;
uniform float uRoll;

void main ()
{
    vec2 texel = 1.0 / uResolution;
    vec2 px = floor(vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uResolution);
    vec3 color;
    color.g = texture2D(uMainSampler, outTexCoord).g;
    color.r = texture2D(uMainSampler, outTexCoord + vec2(texel.x * uAberration, 0.0)).r;
    color.b = texture2D(uMainSampler, outTexCoord - vec2(texel.x * uAberration, 0.0)).b;
    color += (hash(px + floor(uTime * 24.0)) - 0.5) * uGrain;
    if (mod(px.y, 2.0) >= 1.0)
    {
        color *= 1.0 - uScanlines;
    }
    color *= 1.0 + sin((px.y / uResolution.y) * 3.0 - uTime * 0.6) * uRoll;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
