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
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0][0];
    const freqValues = parameters.frequency;
    const waveformValues = parameters.waveform;

    for (let i = 0; i < output.length; i += 1) {
      const rawFreq = freqValues.length === 1 ? freqValues[0] : freqValues[i];
      const frequency = Math.max(0.1, Math.min(20000, rawFreq));
      const waveformRaw = waveformValues.length === 1 ? waveformValues[0] : waveformValues[i];
      const waveformIndex = Math.max(0, Math.min(4, Math.round(waveformRaw)));
      const phaseStep = frequency / sampleRate;
      const duty = Math.min(0.95, phaseStep);

      this.phase += phaseStep;
      if (this.phase >= 1) {
        this.phase -= Math.floor(this.phase);
      }

      if (waveformIndex === 0) {
        let pulse = 0;
        if (this.phase < phaseStep) {
          pulse = 1;
        }

        // Keep impulse mode near zero-mean so it does not drift into DC.
        output[i] = pulse ? 1 - duty : -duty;
        continue;
      }

      if (waveformIndex === 1) {
        output[i] = Math.sin(2 * Math.PI * this.phase);
        continue;
      }

      if (waveformIndex === 2) {
        output[i] = 1 - 4 * Math.abs(this.phase - 0.5);
        continue;
      }

      if (waveformIndex === 3) {
        output[i] = 2 * this.phase - 1;
        continue;
      }

      output[i] = this.phase < 0.5 ? 1 : -1;
    }

    return true;
  }
}

registerProcessor("impulse-train-processor", ImpulseTrainProcessor);
