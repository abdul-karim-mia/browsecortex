/**
 * Animation state machine for glow effects
 * Manages state transitions and animation parameters
 */

export type AnimationState = 'idle' | 'thinking' | 'working' | 'error';

export interface StateConfig {
  pulseSpeed: number;
  particleCount: number;
  hueBase: number;
  saturation: number;
  lightness: number;
  intensity: number;
  label: string;
}

export class GlowAnimator {
  private state: AnimationState = 'idle';
  private previousState: AnimationState = 'idle';
  private transitionProgress = 0;
  private transitionSpeed = 0.1; // Speed of state transition (0-1 per update)

  private readonly stateConfigs: Record<AnimationState, StateConfig> = {
    idle: {
      pulseSpeed: 0.01,
      particleCount: 15,
      hueBase: 200,
      saturation: 60,
      lightness: 50,
      intensity: 0.4,
      label: 'Ready',
    },
    thinking: {
      pulseSpeed: 0.015,
      particleCount: 20,
      hueBase: 240,
      saturation: 85,
      lightness: 60,
      intensity: 0.7,
      label: 'Thinking',
    },
    working: {
      pulseSpeed: 0.02,
      particleCount: 25,
      hueBase: 220,
      saturation: 85,
      lightness: 60,
      intensity: 1.0,
      label: 'Working',
    },
    error: {
      pulseSpeed: 0.025,
      particleCount: 30,
      hueBase: 0,
      saturation: 100,
      lightness: 60,
      intensity: 1.0,
      label: 'Error',
    },
  };

  setState(newState: AnimationState): void {
    if (this.state !== newState) {
      this.previousState = this.state;
      this.state = newState;
      this.transitionProgress = 0;
    }
  }

  getState(): AnimationState {
    return this.state;
  }

  getLabel(): string {
    return this.stateConfigs[this.state].label;
  }

  getConfig(): StateConfig {
    // If transitioning, blend configs
    if (this.transitionProgress < 1) {
      this.transitionProgress += this.transitionSpeed;
      return this.transitionConfig(this.previousState, this.state, this.transitionProgress);
    }
    return this.stateConfigs[this.state];
  }

  transitionConfig(
    fromState: AnimationState,
    toState: AnimationState,
    progress: number
  ): StateConfig {
    const from = this.stateConfigs[fromState];
    const to = this.stateConfigs[toState];

    return {
      pulseSpeed: from.pulseSpeed + (to.pulseSpeed - from.pulseSpeed) * progress,
      particleCount: Math.round(
        from.particleCount + (to.particleCount - from.particleCount) * progress
      ),
      hueBase: from.hueBase + (to.hueBase - from.hueBase) * progress,
      saturation: from.saturation + (to.saturation - from.saturation) * progress,
      lightness: from.lightness + (to.lightness - from.lightness) * progress,
      intensity: from.intensity + (to.intensity - from.intensity) * progress,
      label: to.label, // Always show target state label
    };
  }

  getAllStates(): Record<AnimationState, StateConfig> {
    return this.stateConfigs;
  }
}
