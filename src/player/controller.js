import {
  GRAVITY,
  TERMINAL_VELOCITY,
  FIXED_DT,
  WALK_SPEED,
  SPRINT_SPEED,
  JUMP_SPEED,
  PLAYER_EYE_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
} from '../config.js';
import { moveAABB, fallDamage } from '../physics/physics.js';
import { blockDef } from '../blocks.js';

const CROUCH_SPEED = 1.8;
const CROUCH_EYE_HEIGHT = 1.32;
const AIR_CONTROL = 0.35;
const GROUND_ACCEL = 14;
const EYE_LERP_RATE = 12;
const PITCH_LIMIT = (89 * Math.PI) / 180;
const STRIDE_WALK = 1.9;
const STRIDE_SPRINT = 2.4;
const LAND_IMPACT_THRESHOLD = 6;
const MIN_STEP_SPEED = 0.4;
const NOISE_BASE = 3;
const NOISE_SPEED_K = 0.45;
const NOISE_CROUCH_MAX = 1.2;
const NOISE_JUMP_BURST = 4;
const JUMP_PULSE_DECAY = 3;
const MAX_ACCUMULATOR = FIXED_DT * 10;

export class Controller {
  constructor(inputProvider, hooks = {}) {
    this.input = inputProvider;
    this.hooks = hooks;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.halfExtents = { w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.sprinting = false;
    this.crouching = false;
    this.alive = true;
    this.eyeHeight = PLAYER_EYE_HEIGHT;
    this.noiseJumpPulse = 0;
    this.strideAccum = 0;
    this.accumulator = 0;
  }

  respawn(pos) {
    this.pos.x = pos.x;
    this.pos.y = pos.y;
    this.pos.z = pos.z;
    this.vel.x = 0;
    this.vel.y = 0;
    this.vel.z = 0;
    this.onGround = false;
    this.alive = true;
    this.eyeHeight = PLAYER_EYE_HEIGHT;
    this.noiseJumpPulse = 0;
    this.strideAccum = 0;
    this.accumulator = 0;
  }

  update(dt, world) {
    if (!this.alive || !(dt > 0)) return;
    const input = this.input.getState();
    const look = this.input.getLookDelta();
    this.yaw += look.yaw;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + look.pitch));
    this.crouching = !!input.crouch;
    this.sprinting = !!input.sprint && !this.crouching;
    this.accumulator = Math.min(this.accumulator + dt, MAX_ACCUMULATOR);
    while (this.accumulator >= FIXED_DT) {
      this.accumulator -= FIXED_DT;
      this.stepFixed(input, world);
    }
    const eyeTarget = this.crouching ? CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT;
    this.eyeHeight += (eyeTarget - this.eyeHeight) * Math.min(1, EYE_LERP_RATE * dt);
  }

  stepFixed(input, world) {
    const speed = this.crouching ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    let wishX = -Math.sin(this.yaw) * input.fwd + Math.cos(this.yaw) * input.strafe;
    let wishZ = -Math.cos(this.yaw) * input.fwd - Math.sin(this.yaw) * input.strafe;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }
    const control = this.onGround ? 1 : AIR_CONTROL;
    const accelK = Math.min(1, GROUND_ACCEL * control * FIXED_DT);
    this.vel.x += (wishX * speed - this.vel.x) * accelK;
    this.vel.z += (wishZ * speed - this.vel.z) * accelK;

    if (input.jump && this.onGround) {
      this.vel.y = JUMP_SPEED;
      this.onGround = false;
      this.noiseJumpPulse = 1;
      if (this.hooks.onJump) this.hooks.onJump();
    }

    this.vel.y -= GRAVITY * FIXED_DT;
    if (this.vel.y < -TERMINAL_VELOCITY) this.vel.y = -TERMINAL_VELOCITY;

    const impactVel = this.vel.y;
    const res = moveAABB(world, this.pos, this.vel, this.halfExtents, FIXED_DT);
    const landed = !this.onGround && res.onGround;
    this.onGround = res.onGround;

    if (landed) {
      if (impactVel < -LAND_IMPACT_THRESHOLD && this.hooks.onLand) this.hooks.onLand(impactVel);
      const dmg = fallDamage(Math.abs(impactVel));
      if (dmg > 0 && this.hooks.onFallDamage) this.hooks.onFallDamage(dmg);
    }

    if (this.onGround) {
      const hSpeed = Math.hypot(this.vel.x, this.vel.z);
      if (hSpeed > MIN_STEP_SPEED) {
        this.strideAccum += hSpeed * FIXED_DT;
        const stride = this.sprinting ? STRIDE_SPRINT : STRIDE_WALK;
        if (this.strideAccum >= stride) {
          this.strideAccum -= stride;
          const underId = world.getBlock(
            Math.floor(this.pos.x),
            Math.floor(this.pos.y - 0.01),
            Math.floor(this.pos.z)
          );
          const mat = blockDef(underId).soundMat || 'soft';
          if (this.hooks.onFootstep) {
            this.hooks.onFootstep(mat, Math.min(1, hSpeed / SPRINT_SPEED));
          }
        }
      } else {
        this.strideAccum = 0;
      }
    }

    this.noiseJumpPulse *= Math.exp(-JUMP_PULSE_DECAY * FIXED_DT);
    if (this.noiseJumpPulse < 0.01) this.noiseJumpPulse = 0;
  }

  getEyeHeight() {
    return this.eyeHeight;
  }

  getNoiseRadius() {
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const radius =
      NOISE_BASE + hSpeed * NOISE_SPEED_K + this.noiseJumpPulse * NOISE_JUMP_BURST;
    if (this.crouching) return Math.min(NOISE_CROUCH_MAX, radius);
    return radius;
  }
}
