(function() {

	var $ = require("utils", "web", "json");
	var SDM = require("conf");

	var Graph = new $.Class({

		'extends': $.Eventable,

		initialize: function(canvas) {
			var self = this;
			this.canvas = canvas;
			this.ctx = canvas.getContext("2d");
			this.offset_x = 65;
			this.offset_top = 0;
			this.offset_bottom = 8;
			this.offset_title = 20;
			this.offset_graph_left = 30;
			this.offset_graph_top = 10;
			this.time_scale_height = 60;
			this.abp_min = 30;
			this.pulse_min = 30;

			// normal ABP borders
			this.border = {
				systolic_hyper: {
					day: 140,
					night: 120
				},
				diastolic_hyper: {
					day: 90,
					night: 80
				},
				pulse_high: {
					day: 100,
					night: 80
				},
				systolic_hypo: 90,
				diastolic_hypo: 60,
				pulse_low: 60
			};
		},

		on_mouse_move: function(e) {
			var time = this.x2t(e.clientX - this.canvas_offset.left);
			var i;
			for (i = 0; i < this.time.length - 1; i++) {
				if (time < this.time[i])
					break;
			}
			var sel = Math.abs(time - this.time[i - 1]) < Math.abs(time - this.time[i]) ? i - 1 : i;
			this.select(sel);
		},

		select: function(n) {
			if (this.selected == n)
				return;

			this.selected = n;
			var time = this.time[n];
			this.plot();
			var x = this.t2x(time);
			this.draw_line(x, 0, x, this.height, "gray");
			this.event("select", n);
			// var title_x = this.width - 400, title_y = 10;
			// this.draw_text("Систола: " + this.systolic[n] + ", Диастола: " + this.diastolic[sel] + ", ЧСС: " + this.pulse[sel] + ", Время: " + $.time("H:M", time / 1000), title_x, title_y, "#444444");
		},

		resize: function(width, height) {
			if (this.canvas.style.display == "none")
				return;
			this.canvas_offset = $.offset(this.canvas);
			this.canvas.setAttribute("width", this.width = width || this.width);
			this.canvas.setAttribute("height", this.height = height || this.height);
			var h = this.height - this.offset_bottom - this.offset_top - this.offset_graph_top - this.time_scale_height;
			this.abp_height = Math.round(h * 2 / 3);
			this.pulse_height = Math.round(h / 3);
			this.pulse_offset_y = this.offset_top + this.offset_graph_top + this.abp_height + this.time_scale_height;
			var time_diff = this.end_time - this.start_time;
			this.abp_max = 0;
			this.pulse_max = 0;
			for (var i = 0; i < (this.systolic || []).length; i++) {
				if (this.errors[i] != null || this.artefacts[i] != null)
					continue;
				if (this.abp_max < this.systolic[i])
					this.abp_max = this.systolic[i];
				if (this.pulse_max < this.pulse[i])
					this.pulse_max = this.pulse[i];
			}
			this.scale_x = time_diff / (this.width - 2 * this.offset_x); // ms per pixel
			this.scale_abp_y = (this.abp_max - this.abp_min) / (this.abp_height - this.offset_title); // pixels per mm
			this.scale_pulse_y = (this.pulse_max - this.pulse_min) / (this.pulse_height - this.offset_title); // pixels per mm
		},

		update: function(systolic, diastolic, time, pulse, errors, artefacts) {
			this.systolic = systolic;
			this.diastolic = diastolic;
			this.time = time;
			this.pulse = pulse;
			this.errors = errors;
			this.artefacts = artefacts;
			this.start_time = this.time[0];
			this.end_time = this.time[this.time.length - 1];
			this.resize();

			this.day_intervals = this.get_day_intervals();

			this.area_under_curve = {
				systolic_hyper:		this.get_area_under_curve(this.systolic,	this.day_intervals, this.border.systolic_hyper.day,	this.border.systolic_hyper.night,	true),
				diastolic_hyper:	this.get_area_under_curve(this.diastolic,	this.day_intervals, this.border.diastolic_hyper.day,	this.border.diastolic_hyper.night,	true),
				systolic_hypo:		this.get_area_under_curve(this.systolic,	this.day_intervals, this.border.systolic_hypo,		this.border.systolic_hypo,		false),
				diastolic_hypo:		this.get_area_under_curve(this.diastolic,	this.day_intervals, this.border.diastolic_hypo,		this.border.diastolic_hypo,		false),
				pulse_high:		this.get_area_under_curve(this.pulse,		this.day_intervals, this.border.pulse_high.day,		this.border.pulse_high.night,		true),
				pulse_low:		this.get_area_under_curve(this.pulse,		this.day_intervals, this.border.pulse_low,		this.border.pulse_low,			false),
			};
		},

		draw_scale: function() {
			var scale_color = "#777";
			var grid_color = "#eeeeee";
			var bg_color = "#f5f5f5";

			var hour = 60 * 60 * 1000;
			var step = 2 * hour; // h
			var from = this.time[0] - this.time[0] % step + step;
			var to = this.time[this.time.length - 1];
			var time_scale_y = this.offset_top + this.abp_height + 14;
			var start = 0;

			// фон шкалы
			this.ctx.fillStyle = bg_color;
			this.ctx.fillRect(0, 0, this.offset_x, this.height);
			this.ctx.fillRect(0, time_scale_y - 10, this.width, this.pulse_offset_y - time_scale_y);

			// горизонтальная шкала
			for (var time = from; time <= to; time += step) {
				var x = this.t2x(time);
				this.draw_line(x, time_scale_y, x, time_scale_y + 10, scale_color);
				this.draw_text(String((time / hour) % 24) + ":00", x - 15, time_scale_y + 21, scale_color);
				this.draw_line(x, time_scale_y + 24, x, time_scale_y + 34, scale_color);
				this.draw_line(x, 0, x, this.offset_top + this.abp_height, grid_color); // grid horizontal ABP
				this.draw_line(x, this.pulse_offset_y, x, this.height, grid_color); // grid horizontal pulse
				// graphs delimiter
				// this.draw_line(start, time_scale_y + 17, x - 20, time_scale_y + 17, scale_color);
				// start = x + 25;
			}
			// this.draw_line(start, time_scale_y + 17, this.width, time_scale_y + 17, scale_color);

			// вертикальная шкала - АД
			var step = 30;
			var from = step;
			var to = this.y2abp(0);
			for (var abp = from; abp < to; abp += step) {
				var y = this.abp2y(abp);
				if (y > this.abp_height + this.offset_top)
					continue;
				this.draw_line(10, y, 20, y, scale_color);
				this.draw_text(abp, 22, y + 4, scale_color);
				this.draw_line(45, y, 55, y, scale_color);
				this.draw_line(this.offset_x, y, this.width, y, grid_color); // grid vertical
			}

			// вертикальная шкала - ЧСС
			var step = 30;
			for (var pulse = step; pulse < this.pulse_max + 20; pulse += step) {
				var y = this.pulse2y(pulse);
				if (y > this.height - this.offset_bottom)
					continue;
				if (y < this.pulse_offset_y)
					continue;
				this.draw_line(10, y, 20, y, scale_color);
				this.draw_text(pulse, 22, y + 4, scale_color);
				this.draw_line(45, y, 55, y, scale_color);
				this.draw_line(this.offset_x, y, this.width, y, grid_color); // grid vertical
			}
		},

		draw_line: function(x1, y1, x2, y2, color) {
			this.ctx.beginPath();
			this.ctx.strokeStyle = color;
			this.ctx.moveTo(x1, y1);
			this.ctx.lineTo(x2, y2);
			this.ctx.stroke();
		},

		draw_text: function(text, x, y, color, font) {
			font = font || 12;
			this.ctx.font = font + "px monospace";
			this.ctx.strokeStyle = color;
			this.ctx.strokeText(text, x, y);
		},

		fill_polygon: function(color /*, args... */) {
			this.ctx.fillStyle = color;
			this.ctx.beginPath();
			for (var i = 1; i < arguments.length; i++) {
				var point = arguments[i];
				if (i == 1)
					this.ctx.moveTo(point[0], point[1]);
				else
					this.ctx.lineTo(point[0], point[1]);
			}
			this.ctx.closePath();
			this.ctx.fill();
		},

		clear: function() {
			this.ctx.fillStyle = "white";
			this.ctx.fillRect(0, 0, this.width, this.height);
		},

		plot: function() {
			if (!this.systolic || !this.diastolic)
				return;

			this.clear();

			// шкала
			this.draw_scale();

			// заливка
			var index_prev = null;
			for (var i = 0; i < this.systolic.length; i++) {
				if (this.errors[i] != null || this.artefacts[i] != null)
					continue;
				if (index_prev == null) {
					index_prev = i;
					continue;
				}
				var x1 = this.t2x(this.time[index_prev]);
				var x2 = this.t2x(this.time[i]);
				this.fill_polygon(
					"#eeeeee",
					[x1, this.abp2y(this.diastolic[index_prev])],
					[x1, this.abp2y(this.systolic[index_prev])],
					[x2, this.abp2y(this.systolic[i])],
					[x2, this.abp2y(this.diastolic[i])]
				);
				index_prev = i;
			}

			// индекс площади
			this.plot_area_under_curve(this.area_under_curve.systolic_hyper,	"#ffcccc", this.abp2y);
			this.plot_area_under_curve(this.area_under_curve.systolic_hypo,		"#ccccff", this.abp2y);
			this.plot_area_under_curve(this.area_under_curve.diastolic_hyper,	"#ffcccc", this.abp2y);
			this.plot_area_under_curve(this.area_under_curve.diastolic_hypo,	"#ccccff", this.abp2y);
			this.plot_area_under_curve(this.area_under_curve.pulse_high,		"#ffcccc", this.pulse2y);
			this.plot_area_under_curve(this.area_under_curve.pulse_low,		"#ccccff", this.pulse2y);
			// window.z = window.z || 0; console.log("%d - %o", window.z++, this.area_under_curve.systolic_hyper)

			// контур систолы
			this.ctx.beginPath();
			this.ctx.strokeStyle = "#444444";
			this.ctx.lineWidth = 2;
			for (var i = 0; i < this.systolic.length; i++) {
				if (this.errors[i] != null || this.artefacts[i] != null)
					continue;
				var t = this.time[i];
				var x = this.t2x(t);
				var y = this.abp2y(this.systolic[i]);
				if (i == 0)
					this.ctx.moveTo(x, y);
				else
					this.ctx.lineTo(x, y);
			}
			this.ctx.stroke();

			// контур диастолы
			this.ctx.beginPath();
			this.ctx.strokeStyle = "#444444";
			this.ctx.lineWidth = 2;
			for (var i = 0; i < this.diastolic.length; i++) {
				if (this.errors[i] != null || this.artefacts[i] != null)
					continue;
				var t = this.time[i];
				var x = this.t2x(t);
				var y = this.abp2y(this.diastolic[i]);
				if (i == 0)
					this.ctx.moveTo(x, y);
				else
					this.ctx.lineTo(x, y);
			}
			this.ctx.stroke();

			// контур ЧСС
			this.ctx.beginPath();
			this.ctx.strokeStyle = "#444444";
			this.ctx.lineWidth = 2;
			for (var i = 0; i < this.pulse.length; i++) {
				if (this.errors[i] != null || this.artefacts[i] != null)
					continue;
				var t = this.time[i];
				var x = this.t2x(t);
				var y = this.pulse2y(this.pulse[i]);
				if (i == 0)
					this.ctx.moveTo(x, y);
				else
					this.ctx.lineTo(x, y);
			}
			this.ctx.stroke();

			this.ctx.lineWidth = 1;

			// systolic border
			this.draw_border(this.border.systolic_hyper, this.day_intervals, "red", this.abp2y);
			this.draw_dotted_h(this.offset_x, this.width, this.abp2y(this.border.systolic_hypo), "gray");

			// diastolic border
			this.draw_border(this.border.diastolic_hyper, this.day_intervals, "red", this.abp2y);
			this.draw_dotted_h(this.offset_x, this.width, this.abp2y(this.border.diastolic_hypo), "gray");

			// pulse border
			this.draw_border(this.border.pulse_high, this.day_intervals, "red", this.pulse2y, this.pulse_offset_y);
			this.draw_dotted_h(this.offset_x, this.width, Math.round(this.pulse2y(this.border.pulse_low)), "gray");

			this.draw_text(loc.ABP, /*this.offset_x + this.offset_graph_left + 2*/ Math.round(this.width / 2) - 50, this.offset_graph_top + 7, "#444444", 14);
			this.draw_text(loc.rate2, /*this.offset_x + this.offset_graph_left + 2*/ Math.round(this.width / 2) - 90, this.pulse_offset_y + 7, "#444444", 14);
		},

		get_day_intervals: function() {
			var intervals = [];
			var hour = 60 * 60 * 1000;
			var start = this.start_time;
			var is_day = function(time) {
				time = (time / hour) % 24;
				return time > SDM.NIGHT_TIME_END && time < SDM.NIGHT_TIME_START;
			}
			var is_day_from, is_day_to;
			for (var i = 0; i < this.time.length - 1; i++) {
				var from = this.time[i];
				var to = this.time[i + 1];
				is_day_from = is_day(from);
				is_day_to = is_day(to);
				if (is_day_from != is_day_to) {
					offset = (is_day_from ? SDM.NIGHT_TIME_START : SDM.NIGHT_TIME_END) * hour - this.time[i] % (24 * hour);
					intervals.push({type: is_day_from ? "day" : "night", from: start, to: this.time[i] + offset});
					start = this.time[i] + offset;
				}
			}
			intervals.push({type: is_day_to ? "day" : "night", from: start, to: this.end_time});
			// console.log(intervals);
			return intervals;
		},

		get_interval: function(time) {
			for (var i = 0; i < this.time.length - 1; i++) {
				if (this.time[i] < time && time < this.time[i + 1])
					return i;
			}
		},

		split_segment_x: function(x_split, x1, y1, x2, y2) {
			var dx = y1 < y2 ? Math.abs(x_split - x1) : Math.abs(x2 - x_split);
			var dy = (y2 - y1) / (x2 - x1)  * dx;
			return y1 < y2 ? y1 + dy : y2 - dy;
		},

		get_area_under_curve: function(data, day_intervals, border_day, border_night, hypertension) {
			var intervals = [];

			// возвращает время перехода день/ночь в сегменте или null
			var get_time_change = function(from, to) {
				for (var i = 0; i < day_intervals.length - 1; i++) {
					var time = day_intervals[i].to;
					if (from <= time && time < to)
						return time;
				}
			};

			var day_time = day_intervals[0].type == "day";
			var index_prev = null;
			for (var i = 0; i < this.time.length; i++) {
				if (this.errors[i] != null || this.artefacts[i] != null)
					continue;
				if (index_prev == null) {
					index_prev = i;
					continue;
				}
				var time_change = get_time_change(this.time[index_prev], this.time[i]);
				if (time_change) {
					var value = this.split_segment_x(time_change, this.time[index_prev], data[index_prev], this.time[i], data[i]);
					intervals.push({
						from: this.time[index_prev],
						to: time_change,
						from_value: data[index_prev],
						to_value: value,
						threshold: day_time ? border_day : border_night,
						day: day_time
					});
					day_time = !day_time;
					intervals.push({
						from: time_change,
						to: this.time[i],
						from_value: value,
						to_value: data[i],
						threshold: day_time ? border_day : border_night,
						day: day_time
					});
				} else {
					intervals.push({
						from: this.time[index_prev],
						to: this.time[i],
						from_value: data[index_prev],
						to_value: data[i],
						threshold: day_time ? border_day : border_night,
						day: day_time
					});
				}
				index_prev = i;
			}
			for (var i = 0; i < intervals.length; i++) {
				var interval = intervals[i];
				var points = [];
				var gt = function(a, b) { return hypertension ? a > b : a < b };
				var gte = function(a, b) { return hypertension ? a >= b : a <= b };
				var threshold = interval.threshold;

				var y1 = interval.from_value;
				var y2 = interval.to_value;
				var t1 = interval.from;
				var t2 = interval.to;

				var dY = Math.abs(y2 - y1);
				var dX = Math.abs(t2 - t1);
				if (!gt(y1, threshold) && !gt(y2, threshold)) {
					continue;
				} else if (gte(y1, threshold) && gte(y2, threshold)) {
					interval.polygon = [[t2, threshold], [t1, threshold], [t1, y1], [t2, y2]];
				} else if (gt(y1, y2)) { // decreasing
					var dy = Math.abs(y1 - threshold);
					var dx = dX / dY * dy;
					var intersection = [t1 + dx, threshold];
					interval.polygon = [[t1, threshold], intersection, [t1, y1]];
				} else { // increasing
					var dy = Math.abs(threshold - y2);
					var dx = dX / dY * dy;
					var intersection = [t2 - dx, threshold];
					interval.polygon = [[t2, threshold], intersection, [t2, y2]];
				}
			}
			return intervals;
		},

		plot_area_under_curve: function(intervals, color, value2y) {
			var self = this;
			for (var i = 0; i < intervals.length; i++) {
				if (intervals[i].polygon) {
					var points = $.map(function(point) {
						return [self.t2x(point[0]), value2y.apply(self, [point[1]])];
					}, intervals[i].polygon);
					// console.log(points);
					this.fill_polygon.apply(this, [color].concat(points));
				}
			}
		},

		draw_border: function(border, day_intervals, color, value2y, limit_y) {
			limit_y = limit_y || 0;
			border = {
				day: value2y.apply(this, [border.day]),
				night: value2y.apply(this, [border.night])
			};
			for (var i = 0; i < day_intervals.length; i++) {
				var interval = day_intervals[i];
				var y = Math.round(border[interval.type]);
				if (y > limit_y) {
					if (i == 0) {
						this.draw_dotted_h(this.offset_x, this.t2x(interval.from), y, color);
					}
					this.draw_dotted_h(this.t2x(interval.from), this.t2x(interval.to), y, color);
					if (i == day_intervals.length - 1) {
						this.draw_dotted_h(this.t2x(interval.to), this.width, y, color);
					}
				}
				if (i < day_intervals.length - 1) {
					this.draw_dotted_v(this.t2x(interval.to), Math.max(limit_y, border.day), border.night, color);
				}
			}
		},

		draw_dotted_h: function(x1, x2, y, color) {
			this.ctx.strokeStyle = color;
			var s1 = 10, s2 = 4;
			var start = x1 - x1 % (s1 + s2);
			for (var i = start; i < x2; i += s1 + s2) {
				this.ctx.beginPath();
				this.ctx.moveTo(Math.max(x1, i), y);
				this.ctx.lineTo(Math.max(x1, Math.min(x2, i + s1)), y);
				this.ctx.stroke();
			}
		},

		draw_dotted_v: function(x, y1, y2, color) {
			this.ctx.strokeStyle = color;
			var s1 = 10, s2 = 4;
			for (var i = y1; i < y2; i += s1 + s2) {
				this.ctx.beginPath();
				this.ctx.moveTo(x, i);
				this.ctx.lineTo(x, Math.min(y2, i + s1));
				this.ctx.stroke();
			}
		},

		abp2y: function(abp) {
			return this.offset_top + this.offset_graph_top + this.abp_height - Math.round((abp - this.abp_min) / this.scale_abp_y);
		},

		y2abp: function(y) {
			return (this.offset_top + this.offset_graph_top +  this.abp_height - y) * this.scale_abp_y + this.abp_min;
		},

		pulse2y: function(pulse) {
			return this.height - this.offset_bottom - Math.round(pulse - this.pulse_min) / this.scale_pulse_y;
		},

		y2pulse: function(y) {
			return (this.height - this.offset_bottom - y) * this.scale_pulse_y + this.pulse_min;
		},

		hr2x: function(hours) {
			return this.offset_x + this.offset_graph_left + Math.round(hours * 60 * 60 * 1000 / this.scale_x);
		},

		t2x: function(time) {
			return this.offset_x + this.offset_graph_left + Math.round((time - this.start_time) / this.scale_x);
		},

		x2t: function(x) {
			return (x - this.offset_x - this.offset_graph_left) * this.scale_x + this.start_time;
		}

	});

	exports.Graph = Graph;

})();
