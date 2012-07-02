(function() {

	var $ = require("utils");

	var Filter = new $.Class({

		// octave:
		// f = [0, 0.05, 0.05, 0.3, 0.3, 1]
		// m = [0, 0, 1, 1, 0, 0]
		// b = fir2(8, f, m)
		initialize: function(b) {
			this.b = b;
			this.samples = [];
		},

		process: function(samples) {
			var result = [];
			var length = this.b.length;

			this.samples = this.samples.concat(samples);

			for (var i = 0; i < samples.length; i++) {
				var sum = 0;
				for (var j = 0; j < length; j++) {
					sum += this.b[j] * (this.samples[this.samples.length + i - j] || 0);
				}
				result[i] = sum;
			}

			return result;
		},

		put: function(sample) {
			this.samples.push(sample);
			var result = 0;
			for (var i = 0; i < this.b.length; i++) {
				result += this.b[i] * (this.samples[this.samples.length - 1 - i] || 0);
			}
			return result;
		}

	});

	var LowpassFilter = new $.Class({

		// dt - time interval (1 / frequency)
		// RC - time constant
		initialize: function(dt, RC) {
			this.k = dt / (RC + dt);
			this.signal = [];
		},

		process: function(signal) {
			for (var i = 0; i < signal.length; i++) {
				this.put(signal[i]);
			}
			return this.signal;
			
		},

		put: function(value) {
			if (this.signal.length > 0) {
				value = this.k * value + (1 - this.k) * this.signal[this.signal.length - 1];
			}
			this.signal.push(value);
			return value;
		}

	});

	var MinMaxStream = new $.Class({

		'extends': [$.Eventable, LowpassFilter],

		initialize: function(dt, RC) {
			this['super'](dt, RC);
			this.original = [];
			this.min = [];
			this.max = [];
			this.offset = 0; // current interval start offset
			this._put = this.put;
			this.put = $.F(this, function(value) {
				this.original.push(value);
				value = this._put(value);
				var length = this.signal.length;
				if (length > 1) {
					var direction = this.signal[length - 1] - this.signal[length - 2] > 0;
					if (this.direction == true && direction == false) {
						var min, n;
						for (var i = 0; i < this.original.length; i++) {
							if (min == null || min > this.original[i]) {
								n = i;
								min = this.original[i];
							}
						}
						this.event("min", length); //this.offset + n, min);
						this.offset = length - 1;
						this.original = [];
					}
					this.direction = direction;
				}
				return value;
			});
		}

	});

	/*
	var MinMaxStream = new $.Class({

		initialize: function(n) {
			this.n = n;
			this.samples = [];
		},

		put: function(value) {
			
		}

	});
	*/

	var Average = new $.Class({

		initialize: function(n) {
			this.n = n;
			this.sum = 0;
			this.samples = [];
		},

		put: function(value) {
			if (this.samples.length == 0) {
				for (var i = 0; i < this.n; i++) {
					this.samples.push(value);
					this.sum += value;
				}
			}
			this.sum += value;
			this.sum -= this.samples.shift();
			this.samples.push(value);
			return this.sum / this.n;
		}

	});

	exports.minmax = function(signal, from, to) {
		var min, max;
		from = from || 0;
		to = to || signal.length;
		for (var i = from; i < to; i++) {
			if (min == null || signal[i] < min)
				min = signal[i];
			if (max == null || signal[i] > max)
				max = signal[i];
		}
		return [min, max];
	};

	exports.sig_derivative = function(sig_in) {
		var sig_out = [0];
		for (var i = 1; i < sig_in.length; i++) {
			sig_out[i] = sig_in[i] - sig_in[i - 1];
		}
		return sig_out;
	};

	exports.amplify = function(sig_in, K) {
		var sig_out = [];
		for (var i = 1; i < sig_in.length; i++) {
			sig_out[i] = sig_in[i] * K;
		}
		return sig_out;
	};

	exports.diff = function(signal1, signal2) {
		var out = [];
		for (var i = 0; i < signal1.length; i++) {
			out[i] = signal1[i] - signal2[i];
		}
		return out;
	};

	// sig_in = [0, 1]
	exports.bin = {

		median_filter: function(sig_in, radius) {
			var sig_out = [];
			var zero = 0, nonzero = 0;
			var segment = [];
			for (var i = 0; i < sig_in.length; i++) {
				if (segment.length >= radius) {
					if (segment.shift() == 0)
						zero--;
					else
						nonzero--;
				}
				segment.push(sig_in[i]);
				if (sig_in[i] == 0)
					zero++;
				else
					nonzero++;
				if (i >= radius / 2)
					sig_out[i - radius / 2] = nonzero > zero ? 1 : (nonzero < zero ? 0 : (sig_in[i] == 0 ? 1 : 0));
			}
			return sig_out;
		},

		get_intervals: function(sig_in) {
			var intervals = [];
			var start;
			for (var i = 1; i < sig_in.length; i++) {
				if (sig_in[i - 1] == 0 && sig_in[i] != 0)
					start = i;
				if (sig_in[i - 1] != 0 && sig_in[i] == 0)
					intervals.push([start, i - 1]);
			}
			return intervals;
		}

	};

	exports.Filter = Filter;
	exports.LowpassFilter = LowpassFilter;
	exports.MinMaxStream = MinMaxStream;
	exports.Average = Average;

})();
