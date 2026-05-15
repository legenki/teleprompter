export class Timer {
  constructor(elements, options = {}) {
    this.elements = Array.from(elements);
    this.options = options;
    this.seconds = 0;
    this.intervalId = null;
  }

  format(s) {
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return (hh < 10 ? '0' : '') + hh + ':' +
           (mm < 10 ? '0' : '') + mm + ':' +
           (ss < 10 ? '0' : '') + ss;
  }

  render() {
    const t = this.format(this.seconds);
    this.elements.forEach(el => { el.textContent = t; });
    if (typeof this.options.onChange === 'function') {
      this.options.onChange(t);
    }
  }

  startTimer() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.seconds++;
      this.render();
    }, 1000);
  }

  stopTimer() {
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  resetTimer() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.seconds = 0;
    this.render();
  }
}
