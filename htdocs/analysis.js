(function() {

	var $ = require("utils", "web", "json");
	var SDM = require("graph", "measlist", "conf");

	var str2time = function(str) {
		str = str.split(":");
		return (Number(str[0]) * 60 + Number(str[1])) * 60 * 1000;
	};


	var Analysis = new $.Class({

		'extends': $.Eventable,

		initialize: function(container) {
			var self = this;
			this.container = container;
			this.abp_graph = new SDM.Graph(container);
			container.onmousemove = function(e) {
				self.abp_graph.on_mouse_move(e);
			};
			this.list = new SDM.MeasList(this);
			this.list.onEvent("hover", $.F(this.abp_graph, this.abp_graph.select));
			this.list.onEvent("artefact", $.F(this, function(n, error) {
				this.draw();
				this.event("artefact", n, error);
			}));
			this.abp_graph.onEvent("select", $.F(this.list, this.list.setActive));
		},

		resize: function(width, height) {
			this.abp_graph.resize(width, height);
			this.abp_graph.plot();
		},

		clear: function() {
			this.abp_graph.clear();
		},

		load: function(data) {
			var time_prev, days = 0;
			this.systolic = [], this.diastolic = [], this.time_s = [], this.time = [], this.pulse = [], this.day = [], this.errors = [], this.artefacts = [], this.ids = [];
			this.analysis = null;
			this.count = 0;
			for (var i = 0; i < data.length; i++) {
				var measurement = data[i];
				for (var j = 0; j < 3; j++) {
					measurement[j] = Number(measurement[j]);
				}
				// console.log(data[i]);
				var artefact = ( measurement[5] == '*'
					|| measurement[0] == 0
					|| measurement[1] == 0
					|| measurement[0] < measurement[1]
					|| measurement[0] > SDM.SAD_MAX || measurement[0] < SDM.SAD_MIN
					|| measurement[1] > SDM.DAD_MAX || measurement[1] < SDM.DAD_MIN
					|| measurement[2] > SDM.RATE_MAX || measurement[2] < SDM.RATE_MIN);
				var error = measurement[4] == '*';
				this.time_s.push(measurement[3]);
				var time_meas = str2time(measurement[3]);
				var hours = time_meas / 60 / 60 / 1000;
				var is_day = hours >= SDM.NIGHT_TIME_END && hours <= SDM.NIGHT_TIME_START;
				if (time_prev && time_meas < time_prev)
					days++;
				time_prev = time_meas;
				time_meas += days * 24 * 60 * 60 * 1000;
				this.systolic.push(measurement[0]);
				this.diastolic.push(measurement[1]);
				this.pulse.push(measurement[2]);
				this.time.push(time_meas);
				this.errors.push(error ? measurement[2] : null);
				this.artefacts.push(artefact ? 1 : null);
				this.ids.push(measurement[6]);
				this.day.push(is_day);
				this.count++;
			}
		},

		draw: function() {
			this.abp_graph.update(this.systolic, this.diastolic, this.time, this.pulse, this.errors, this.artefacts);
			this.abp_graph.plot();
		},

		drawPath: function(data, color) {
			this.ctx.beginPath();
			this.ctx.strokeStyle = color;
			var x = 10;
			this.ctx.moveTo(x, 400 - 2 * data[0]);
			for (var i = 1; i < data.length; i++) {
				this.ctx.lineTo(x += 20, 400 - 2 * data[i]);
			}
			this.ctx.stroke();
		},

		drawList: function(container) {
			this.list.draw(container);
		},

		analyze: function() {
			if (this.analysis)
				return this.analysis;

			var format = function(value, digits) {
				var x = Math.pow(10, digits || 0);
				return Math.round(value * x) / x;
			};

			var analyze_period = $.F(this, function(period) {
				var keys = ["systolic", "diastolic", "pulse", "pulse_bp", "kerdo", "s_kriteria", "double_product"];
				var analysis = {};
				this.kerdo = [];
				this.s_kriteria = [];
				this.double_product = [];
				var filter = function(v) {
					return v;
				};
				var data = {};
				$.each(keys, function(key) {
					data[key] = [];
				});
				for (var i = 0; i < this.systolic.length; i++) {
					if (this.errors[i] != null || this.artefacts[i] != null)
						continue;
					if (period == "day" && !this.day[i])
						continue;
					if (period == "night" && this.day[i])
						continue;
					data.systolic[i] = this.systolic[i];
					data.diastolic[i] = this.diastolic[i];
					data.pulse[i] = this.pulse[i];

					// Пульсовое АД = АД сист - АД диаст
					data.pulse_bp[i] = this.systolic[i] - this.diastolic[i];

					// индекс Кердо = 100 * (1 - АД) / ЧСС
					data.kerdo[i] = 100 * (1 - this.diastolic[i] / this.pulse[i]);

					// Критерий S = (АД сист * АД диаст) / (АД сист - АД диаст)
					data.s_kriteria[i] = this.systolic[i] * this.diastolic[i] / (this.systolic[i] - this.diastolic[i]);

					// Двойное произведение = АД сист * ЧСС / 100
					data.double_product[i] = this.systolic[i] * this.pulse[i] / 100;
				}

				analysis.data = data;

				$.each(keys, function(key) {
					var values = $.grep(null, data[key]);
					analysis[key] = {};
					analysis[key].min = format(Math.vector.min(values));
					analysis[key].max = format(Math.vector.max(values));
					analysis[key].mean = format(Math.mean(values));
					analysis[key].std = format(Math.std(values), 1);
				}, this);

				// Индекс времени, индекс площади
				analysis.blood_pressure_load = {};
				analysis.area_under_curve = {};

				var keys2 = ["systolic", "diastolic"];
				var keys3 = ["hyper", "hypo"];

				$.every(keys2, function(key2) {
					analysis.blood_pressure_load[key2] = {};
					analysis.area_under_curve[key2] = {};

					$.every(keys3, function(key3) {
						var intervals = this.abp_graph.area_under_curve[key2 + '_' + key3];
						var filter = period == "day" ? {day: {$eq: true}} : (period == "night" ? {day: {$eq: false}} : null);
						intervals = $.grep(filter, intervals);
						var area_under_curve = 0; // Индекс площади
						var blood_pressure_load = 0; // Индекс времени
						var duration = intervals.length ? ((intervals[intervals.length - 1].to - intervals[0].from) / 1000 / 60 / 60) : 1;
						$.every(intervals, function(interval) {
							var points = interval.polygon;
							if (points) {
								var width = (interval.to - interval.from) / 1000 / 60 / 60; // мс. => ч.
								// console.log(interval);
								var area;
								var under = key3 == "hypo";
								if (points.length == 3) { //площадь треугольника
									var _ = points, bottom_left = _[0], bottom_right = _[1], top = _[2];
									var height = Math.abs(top[1] - bottom_left[1]);
									var w = (Math.max(bottom_left[0], bottom_right[0], top[0]) - Math.min(bottom_left[0], bottom_right[0], top[0])) / 1000 / 60 / 60;
									area = w * height / 2;
									blood_pressure_load += w;
									// console.log("%d/%d", w, width);
								} else if (points.length == 4) { // площадь четырехугольника
									var _ = points, bottom_left = _[0], bottom_right = _[1], top_right = _[2], top_left = _[3];
									var y0 = bottom_left[1]; // граница
									var y_min = Math.min(top_left[1], top_right[1]);
									var y_max = Math.max(top_left[1], top_right[1]);
									var y1 = under ? y_min : y_max;
									var y2 = under ? y_max : y_min;
									area = width * Math.abs(y1 - y0) + width * Math.abs(y2 - 1) / 2;
									blood_pressure_load += width;
								}
								area_under_curve += area;
							}
						});
						analysis.blood_pressure_load[key2][key3] = format(100 * blood_pressure_load / duration, 1);
						analysis.area_under_curve[key2][key3] = format(area_under_curve, 1);
					}, this);
				}, this);
				return analysis;
			});

			this.analysis = {
				full: analyze_period(),
				day: analyze_period("day"),
				night: analyze_period("night")
			};

			var keys = ["systolic", "diastolic"];
			this.analysis.day_index = {};
			this.analysis.speed = {};

			for (var k in keys) {
				var key = keys[k];

				// минимальное и максимальное давление за специальный период (4:00 - 10:00)
				var t_max = null, t_min = null, min = null, max = null;
				for (var i = 0; i < this[key].length; i++) {
					var t = (this.time[i] / 60 / 60 / 1000) % 24;
					if (t >= SDM.SPECIAL_TIME_START && t <= SDM.SPECIAL_TIME_END) {
						var value = this[key][i];
						if (max == null || value > max) {
							max = value;
							t_max = this.time[i] / 60 / 60 / 1000;
						}
						if (min == null || value < min) {
							min = value;
							t_min = this.time[i] / 60 / 60 / 1000;
						}
					}
				}
				// alert(max + " " + min + " " + t_max + " " + t_min)

				// alert(analysis.day[key].mean + " "  + analysis.night[key].mean);
				// суточный индекс
				this.analysis.day_index[key] = format((this.analysis.day[key].mean - this.analysis.night[key].mean) / this.analysis.day[key].mean * 100, 1);

				// скорость утреннего повышения = (АД макс - АД мин) / (t макс - t мин)
				this.analysis.speed[key] = (t_max != null && t_min != null && t_max > t_min)
					? format((max - min) / (t_max - t_min), 1)
					: null;
			}
			// console.log(this.analysis);
			return this.analysis;
		}

	});

	exports.Analysis = Analysis;

})();
