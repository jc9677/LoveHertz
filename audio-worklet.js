class ImpulseTrainProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "frequency",
        defaultValue: 4,
        minValue: 0.1,
        maxValue: 20000,
        automationRate: "a-rate",
      },
      {
        name: "waveform",
        defaultValue: 0,
        minValue: 0,
        maxValue: 4,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.stepCount = 1;
    this.cycleCounter = 0;
    this.currentStep = 0;
    this.sequence = [1];

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message || message.type !== "set-sequence") {
        return;
      }

      const rawStepCount = Number(message.stepCount);
      const stepCount = Math.max(1, Math.min(32, Math.floor(rawStepCount) || 1));
      const incomingSequence = Array.isArray(message.sequence) ? message.sequence : [];

      this.stepCount = stepCount;
      this.sequence = Array.from({ length: stepCount }, (_, index) => {
        return incomingSequence[index] === false ? 0 : 1;
      });
      this.currentStep = this.cycleCounter % this.stepCount;
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0][0];
    const freqValues = parameters.frequency;
    const waveformValues = parameters.waveform;
    let lastTriggeredStep = -1;

    for (let i = 0; i < output.length; i += 1) {
      const rawFreq = freqValues.length === 1 ? freqValues[0] : freqValues[i];
      const frequency = Math.max(0.1, Math.min(20000, rawFreq));
      const waveformRaw = waveformValues.length === 1 ? waveformValues[0] : waveformValues[i];
      const waveformIndex = Math.max(0, Math.min(4, Math.round(waveformRaw)));
      const phaseStep = frequency / sampleRate;
      let didAdvanceStep = false;

      this.phase += phaseStep;
      if (this.phase >= 1) {
        const wraps = Math.floor(this.phase);
        this.phase -= wraps;
        this.cycleCounter += wraps;
        this.currentStep = this.cycleCounter % this.stepCount;
        didAdvanceStep = true;
        lastTriggeredStep = this.currentStep;
      }

      const samplePhase = this.phase;
      const stepEnabled = this.sequence[this.currentStep] !== 0;

      if (!stepEnabled) {
        output[i] = 0;
        continue;
      }

      if (waveformIndex === 0) {
        const isStartOfEnabledCycle = didAdvanceStep;
        output[i] = isStartOfEnabledCycle ? 1 : 0;
      } else if (waveformIndex === 1) {
        output[i] = Math.sin(2 * Math.PI * samplePhase);
      } else if (waveformIndex === 2) {
        output[i] = 1 - 4 * Math.abs(samplePhase - 0.5);
      } else if (waveformIndex === 3) {
        output[i] = 1 - samplePhase;
      } else {
        output[i] = samplePhase < 0.5 ? 1 : -1;
      }
    }

    if (this.stepCount > 1 && lastTriggeredStep >= 0) {
      this.port.postMessage({
        type: "step-trigger",
        stepIndex: lastTriggeredStep,
      });
    }

    return true;
  }
}

registerProcessor("impulse-train-processor", ImpulseTrainProcessor);
