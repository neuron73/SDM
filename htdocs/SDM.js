(function() {

	var $ = require("utils", "web", "json");

	var str2time = function(str) {
		str = str.split(":");
		return (Number(str[0]) * 60 + Number(str[1])) * 60 * 1000;
	};

	var SAD_MIN = 50;
	var SAD_MAX = 300;
	var DAD_MIN = 35;
	var DAD_MAX = 300;
	var RATE_MIN = 6;
	var RATE_MAX = 300;
	var NIGHT_TIME_START = 22;
	var NIGHT_TIME_END = 6;
	var SPECIAL_TIME_START = 4;
	var SPECIAL_TIME_END = 10;
	var MONTHS = {Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"};

	var Analysis = new $.Class({

		initialize: function(container) {
			this.container = container;
			this.abp_graph = new Graph(container);
			this.list = new MeasList(this);
			this.list.onEvent("hover", $.F(this.abp_graph, this.abp_graph.select));
			this.list.onEvent("change", $.F(this, this.draw));
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
			this.systolic = [], this.diastolic = [], this.time = [], this.pulse = [], this.day = [], this.errors = [];
			this.analysis = null;
			this.count = 0;
			for (var i = 0; i < data.length; i++) {
				var measurement = data[i];
				for (var j = 0; j < 3; j++) {
					measurement[j] = Number(measurement[j]);
				}
				// console.log(data[i]);
				var error = ( measurement[4] == '*'
					|| measurement[5] == '*'
					|| measurement[0] == 0
					|| measurement[1] == 0
					|| measurement[0] < measurement[1]
					|| measurement[0] > SAD_MAX || measurement[0] < SAD_MIN
					|| measurement[1] > DAD_MAX || measurement[1] < DAD_MIN
					|| measurement[2] > RATE_MAX || measurement[2] < RATE_MIN);
				var time_meas = str2time(measurement[3]);
				var hours = time_meas / 60 / 60 / 1000;
				var is_day = hours >= NIGHT_TIME_END && hours <= NIGHT_TIME_START;
				if (time_prev && time_meas < time_prev)
					days++;
				time_prev = time_meas;
				time_meas += days * 24 * 60 * 60 * 1000;
				this.systolic.push(measurement[0]);
				this.diastolic.push(measurement[1]);
				this.pulse.push(measurement[2]);
				this.time.push(time_meas);
				this.errors.push(error ? measurement[2] : null);
				this.day.push(is_day);
				this.count++;
			}
		},

		draw: function() {
			this.abp_graph.update(this.systolic, this.diastolic, this.time, this.pulse, this.errors);
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
				var keys = ["systolic", "diastolic", "pulse", "kerdo", "s_kriteria", "double_mult"];
				var analysis = {};
				this.kerdo = [];
				this.s_kriteria = [];
				this.double_mult = [];
				var filter = function(v) {
					return v;
				};
				var data = {};
				$.each(keys, function(key) {
					data[key] = [];
				});
				for (var i = 0; i < this.systolic.length; i++) {
					if (this.errors[i] != null)
						continue;
					if (period == "day" && !this.day[i])
						continue;
					if (period == "night" && this.day[i])
						continue;
					data.systolic[i] = this.systolic[i];
					data.diastolic[i] = this.diastolic[i];
					data.pulse[i] = this.pulse[i];

					// индекс Кердо = 100 * (1 - АД) / ЧСС
					data.kerdo[i] = 100 * (1 - this.diastolic[i] / this.pulse[i]);

					// Критерий S = (АД сист * АД диаст) / (АД сист - АД диаст)
					data.s_kriteria[i] = this.systolic[i] * this.diastolic[i] / (this.systolic[i] - this.diastolic[i]);

					// Двойное произведение = АД сист * ЧСС / 100
					data.double_mult[i] = this.systolic[i] * this.pulse[i] / 100;
				}

				$.each(keys, function(key) {
					var values = $.grep(null, data[key]);
					analysis[key] = {};
					analysis[key].min = format(Math.vector.min(values));
					analysis[key].max = format(Math.vector.max(values));
					analysis[key].mean = format(Math.mean(values));
					analysis[key].std = format(Math.std(values), 1);
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
			this.analysis.blood_pressure_load = {};
			this.analysis.area_under_curve = {};

			for (var k in keys) {
				var key = keys[k];

				this.analysis.blood_pressure_load[key] = {};
				this.analysis.area_under_curve[key] = {};

				// минимальное и максимальное давление за специальный период (4:00 - 10:00)
				var t_max = null, t_min = null, min = null, max = null;
				for (var i = 0; i < this[key].length; i++) {
					var t = (this.time[i] / 60 / 60 / 1000) % 24;
					if (t >= SPECIAL_TIME_START && t <= SPECIAL_TIME_END) {
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

				// Индекс времени, индекс площади
				var keys2 = ["hyper", "hypo"];
				$.every(keys2, function(key2) {
					var intervals = this.abp_graph.area_under_curve[key + '_' + key2];
					var area_under_curve = 0; // Индекс площади
					var blood_pressure_load = 0; // Индекс времени
					var duration = (intervals[intervals.length - 1].to - intervals[0].from) / 1000 / 60 / 60;
					$.every(intervals, function(interval) {
						var points = interval.polygon;
						var width = (interval.to - interval.from) / 1000 / 60 / 60; // мс. => ч.
						if (points) {
							// console.log(interval);
							var area;
							var under = key == "systolic";
							if (points.length == 3) { //площадь треугольника
								var _ = points, bottom_left = _[0], bottom_right = _[1], top = _[2];
								var y_top = top[1];
								var y_bottom = bottom_left[1];
								area = width * Math.abs(y_top - y_bottom) / 2;
							} else if (points.length == 4) { // площадь четырехугольника
								var _ = points, bottom_left = _[0], bottom_right = _[1], top_right = _[2], top_left = _[3];
								var y0 = bottom_left[1]; // граница
								var y_min = Math.min(top_left[1], top_right[1]);
								var y_max = Math.max(top_left[1], top_right[1]);
								var y1 = under ? y_min : y_max;
								var y2 = under ? y_max : y_min;
								area = width * Math.abs(y1 - y0) + width * Math.abs(y2 - 1) / 2;
							}
							blood_pressure_load += width;
							area_under_curve += area;
						}
					});
					this.analysis.blood_pressure_load[key][key2] = format(100 * blood_pressure_load / duration, 1);
					this.analysis.area_under_curve[key][key2] = format(area_under_curve, 1);
				}, this);
			}
			// console.log(this.analysis);
			return this.analysis;
		}

	});

	var MeasList = new $.Class({

		'extends': $.Eventable,

		initialize: function(root) {
			this.root = root;
			this.tr = [];
		},

		draw: function(container) {
			var self = this;
			var bold = function(s) {
				return $.e("span", {style: {fontWeight: "bold"}}, s);
			}
			var rows = [[bold("САД"), bold("ДАД"), bold("ЧСС"), bold("Время"), bold("Ошибка")]];
			for (var i = 0; i < this.root.count; i++) {
				var error, sys, dia, pulse;
				if (this.root.errors[i] != null) {
					error = $.span(this.root.errors[i] ? "#" + String(this.root.errors[i]) : "-");
					sys = dia = pulse = "-";
				} else {
					error = $.e("input", {type: "checkbox", n: i, onchange: function() { self.setError(Number(this.getAttribute("n")), this.checked) }});
					sys = String(this.root.systolic[i]);
					dia = String(this.root.diastolic[i]);
					pulse = String(this.root.pulse[i]);
				}
				rows.push([sys, dia, pulse, $.time("H:M", this.root.time[i] / 1000), error]);
			}
			var style = {textAlign: "center", paddingLeft: 5, paddingRight: 5};
			var table = $.table.apply($, rows).format([style, style, style, style, style]);
			$.clear(container).appendChild(table);
			var n = -2;
			$.every($.$$("tr", table), function(tr) {
				if (++n >= 0) {
					tr.setAttribute("n", n);
					this.tr[n] = tr;
					tr.onmouseover = function() {
						var n = Number(this.getAttribute("n"));
						self.setActive(n);
						self.event("hover", n);
					};
				}
			}, this);
		},

		setError: function(n, error) {
			this.root.errors[n] = error ? 0 : null;
			this.event("change");
		},

		setActive: function(n) {
			if (this.active == n)
				return;
			if (this.active)
				$.klass("-active", this.active);
			this.active = this.tr[n];
			$.klass("+active", this.active);
		}

	});

	var Navigation = new $.Class({

		initialize: function(container, handlers, cache) {
			this.container = container;
			this.handlers = handlers;
			this.cache = cache;
			this.sections = [];
			this.data = {};
			this.draw();
		},

		init: function() {
			this.check();
		},

		check: function() {
			var location = String(window.location.hash);
			if (this.location != location) {
				this.go(location);
			}
			setTimeout($.F(this, this.check), 500);
		},

		open: function() {
			try {
				for (var i = 0; i < arguments.length; i++) {
					if (arguments[i]) {
						var section = this.sections[i] = arguments[i];
						this.handlers[section.type](arguments[i], this.path(i));
					} else if (arguments[i] !== false) {
						continue;
					}
					if (arguments[i + 1] == null) {
						for (i = i + 1; i < this.sections.length; i++) {
							var section = this.sections[i];
							if (section) {
								this.handlers[section.type](null);
								this.sections[i] = null;
							}
						}
					}
				}

				this.set_location();
				this.draw();
			} catch(e) {
				$.warn("open error: %e", e);
			}
		},

		go: function(location) {
			var path = (this.location = location).substr(1).split(",");
			var code = [];
			$.every(path, function(item, i) {
				if (item) {
					var _ = item.split(":"), type = _[0], id = _[1];
					code.push(id);
					var item = this.cache.fetch(type, $.map(null, code)) || {};
					// $.log("fetch type %s, code %o: %o", type, code, item);
					var args = [];
					args[i] = {type: type, id: id, title: item.name}; // (this.data[type] || [])[id]};
					this.open.apply(this, args);
				}
			}, this);
		},

		/*
		get_item: function(type, code, id) {
			var items = this.cache.get(type, code);
			// $.log("get_item type %s, code %o, id %d: %o", type, code, id, items);
			return items[Number(id)];
		},
		*/

		path: function(i) {
			var path = {};
			for (i; i >= 0; i--) {
				path[this.sections[i].type] = this.sections[i].id;
			}
			return path;
		},

		/*
		// XXX: bug!
		set: function(type, id, title) {
			this.data[type] = this.data[type] || [];
			this.data[type][id] = title;
		},
		*/

		set_location: function() {
			var path = [];
			$.every(this.sections, function(section) {
				if (section)
					path.push(section.type + ":" + section.id);
			});
			window.location.hash = this.location = "#" + path.join(",");
		},

		chroot: function(terminal_id) {
			this.root = terminal_id;
			// TODO
		},

		draw: function() {
			try {
				var self = this;
				$.clear(this.container);
				this.container.appendChild($.e("a", {href: "", onclick: function() { self.open(false); return false; }}, "Главная"));
				var code = [];
				$.every(this.sections, function(section, i) {
					if (!section)
						return;
					code.push(section.id);
					this.container.appendChild($.e("span", null, " > "));
					var args = [{type: section.type, id: section.id, title: section.title}];
					for (var j = 0; j < i; j++) args.unshift(null);
					var item = this.cache.fetch(section.type, code) || {};
					var a = $.e("a", {href: "", onclick: function() { self.open.apply(self, args); return false; }}, [section.title || item.name]);
					this.container.appendChild(a);
				}, this);
			} catch(e) {
				$.warn("draw error: %e", e);
			}
		},

		get: function(type) {
			for (var i = 0; i < this.sections.length; i++) {
				if (this.sections[i].type == type) {
					return this.sections[i].id;
				}
			}
		}

	});

	var Menu = new $.Class({

		initialize: function(container, callback) {
			this.container = $.$(container);
			this.callback = callback;
		},

		update: function(items) {
			var self = this;
			this.clear();
			this.items = items;
			$.every(items, function(item) {
				if (item == null) { // delimiter
					this.container.appendChild($.e("div", {'class': "delimiter"}));
				} else {
					var e = $.e("a");
					e.href = "";
					e.onclick = function() {
						self.callback(item[0], item[1]);
						if (item[2])
							item[2](this);
						return false;
					};
					e.innerHTML = item[0];
					this.container.appendChild($.div(e));
				}
			}, this);
		},

		clear: function() {
			this.items = [];
			$.clear(this.container);
		}

	});

	var Cache = new $.Class({

		initialize: function() {
			this.data = {};
		},

		get: function(type, args) {
			var data = this.data[type];
			if (data) {
				if (args && $.is_array(args)) {
					$.every(args, function(arg) {
						if (data)
							data = data[arg];
					});
				} else if (args) {
					data = data[args];
				}
			}
			return data;
		},

		fetch: function(type, args) {
			var id = args.pop();
			return (this.get(type, args) || [])[Number(id)];
		},

		// TODO: expire for type "measlist", ...
		add: function(type, args, data) {
			if (args == null) {
				this.data[type] = data;
			} else {
				var cache = this.data[type] = this.data[type] || {};
				if ($.is_array(args)) {
					for (var i = 0; i < args.length - 1; i++) {
						cache = cache[args[i]] = cache[args[i]] || {};
					}
					cache[args[args.length - 1]] = data;
				} else {
					cache[args] = data;
				}
			}
		}

	});

	var Graph = new $.Class({

		'extends': $.Eventable,

		initialize: function(canvas) {
			var self = this;
			this.canvas = canvas;
			this.canvas.onmousemove = function(e) {
				self.on_mouse_move(e);
			};
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
		},

		on_mouse_move: function(e) {
			var time = this.x2t(e.clientX - this.canvas_offset.left);
			var i;
			for(i = 0; i < this.time.length - 1; i++) {
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
				if (this.errors[i] != null)
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

		update: function(systolic, diastolic, time, pulse, errors) {
			this.systolic = systolic;
			this.diastolic = diastolic;
			this.time = time;
			this.pulse = pulse;
			this.errors = errors;
			this.start_time = this.time[0];
			this.end_time = this.time[this.time.length - 1];
			this.resize();

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

			this.day_intervals = this.get_day_intervals();

			this.area_under_curve = {
				systolic_hyper:		this.get_area_under_curve(this.systolic,	this.day_intervals, this.border.systolic_hyper.day,	this.border.systolic_hyper.night,	true),
				systolic_hypo:		this.get_area_under_curve(this.diastolic,	this.day_intervals, this.border.diastolic_hyper.day,	this.border.diastolic_hyper.night,	true),
				diastolic_hyper:	this.get_area_under_curve(this.systolic,	this.day_intervals, this.border.systolic_hypo,		this.border.systolic_hypo,		false),
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
				if (this.errors[i] != null)
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
			this.plot_area_under_curve(this.area_under_curve.systolic_hypo,		"#ffcccc", this.abp2y);
			this.plot_area_under_curve(this.area_under_curve.diastolic_hyper,	"#ccccff", this.abp2y);
			this.plot_area_under_curve(this.area_under_curve.diastolic_hypo,	"#ccccff", this.abp2y);
			this.plot_area_under_curve(this.area_under_curve.pulse_high,		"#ffcccc", this.pulse2y);
			this.plot_area_under_curve(this.area_under_curve.pulse_low,		"#ccccff", this.pulse2y);
			// window.z = window.z || 0; console.log("%d - %o", window.z++, this.area_under_curve.systolic_hyper)

			// контур систолы
			this.ctx.beginPath();
			this.ctx.strokeStyle = "#444444";
			this.ctx.lineWidth = 2;
			for (var i = 0; i < this.systolic.length; i++) {
				if (this.errors[i] != null)
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
				if (this.errors[i] != null)
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
				if (this.errors[i] != null)
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

			this.draw_text("Артериальное давление", /*this.offset_x + this.offset_graph_left + 2*/ Math.round(this.width / 2) - 50, this.offset_graph_top + 7, "#444444", 14);
			this.draw_text("Частота сердечных сокращений", /*this.offset_x + this.offset_graph_left + 2*/ Math.round(this.width / 2) - 90, this.pulse_offset_y + 7, "#444444", 14);
		},

		get_day_intervals: function() {
			var intervals = [];
			var hour = 60 * 60 * 1000;
			var start = this.start_time;
			var is_day = function(time) {
				time = (time / hour) % 24;
				return time > NIGHT_TIME_END && time < NIGHT_TIME_START;
			}
			var is_day_from, is_day_to;
			for (var i = 0; i < this.time.length - 1; i++) {
				var from = this.time[i];
				var to = this.time[i + 1];
				is_day_from = is_day(from);
				is_day_to = is_day(to);
				if (is_day_from != is_day_to) {
					offset = (is_day_from ? NIGHT_TIME_START : NIGHT_TIME_END) * hour - this.time[i] % (24 * hour);
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
				if (this.errors[i] != null)
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
						threshold: day_time ? border_day : border_night
					});
					day_time = !day_time;
					intervals.push({
						from: time_change,
						to: this.time[i],
						from_value: value,
						to_value: data[i],
						threshold: day_time ? border_day : border_night
					});
				} else {
					intervals.push({
						from: this.time[index_prev],
						to: this.time[i],
						from_value: data[index_prev],
						to_value: data[i],
						threshold: day_time ? border_day : border_night
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

	var Interface = new $.Class({

		'extends': $.Eventable,

		initialize: function(backend, cgi_bin) {
			this.backend = backend;
			this.cgi_bin = cgi_bin;
			this.onEvent("add_meas", $.F(this, function(add) {
				$.toggle(!add, "add_meas_link");
				$.toggle(add, "add_meas_files");
				$.$("add_meas_terminal").value = this.navigation.get("terminal");
				$.$("add_meas_patient").value = this.navigation.get("patient");
				this.add_meas_select($.$("add_meas_input"));
			}));
			this.onEvent("add_meas_select", $.F(this, this.add_meas_select));
			this.onEvent("add_meas_callback", $.F(this, function(terminal, patient, status) {
				if (status) {
					alert(status);
					return;
				}
				var items = [];
				var measlist = this.load_meas_list(this.navigation.get("terminal"), this.navigation.get("patient"));
				$.every(measlist, function(meas) {
					if (meas) {
						items.push([meas.name, meas]);
					}
				});
				this.menus.measurements.update(items);
				add_meas(false);
			}));
			this.onEvent("add_patient", $.F(this, function(terminal) {
				this.block_main("card_info");
				this.make_card_info(null, terminal);
			}));
			this.onEvent("card_monitoring_update", $.F(this, function(terminal) {
				var duration = Number($.$("card_monitor_duration").value);
				var start = Math.floor(new Date() / 1000) + 5 * 60;
				var end = start + duration * 60 * 60;
				var plan = {
					indication: $.$("card_monitor_indication").checked ? 1 : 0,
					interval_active: $.$("card_monitor_interval_active").value,
					interval_passive: $.$("card_monitor_interval_passive").value,
					start: start,
					end: end,
					night_start: NIGHT_TIME_START,
					night_end: NIGHT_TIME_END,
					special: SPECIAL_TIME_START
				};
				var keys = ["query=plan"];
				for (var k in plan) {
					keys.push(k + "=" + plan[k]);
				}
				$.$("card_monitor_plan_download").href = this.cgi_bin + "plan_.txt?" + keys.join("&");

				var xx = function(n) {
					return n < 10 ? "0" + n : n;
				};
				var format = function(date) {
					date = new Date(date * 1000);
					return xx(date.getDate()) + "." + xx(date.getMonth() + 1) + "." + (date.getYear() + 1900) + " " + xx(date.getHours()) + ":" + xx(date.getMinutes());
				};
				$.$("card_monitor_time_start").innerHTML = format(plan.start);
				$.$("card_monitor_time_end").innerHTML = format(plan.end);

				$.$("card_monitor_active_start").innerHTML = NIGHT_TIME_END + ":00";
				$.$("card_monitor_active_end").innerHTML = NIGHT_TIME_START + ":00";
				$.$("card_monitor_passive_start").innerHTML = NIGHT_TIME_START + ":00";
				$.$("card_monitor_passive_end").innerHTML = NIGHT_TIME_END + ":00";
			}));
			this.onEvent("update_analysis", $.F(this, this.draw_analysis));
			this.onEvent("resize", $.F(this, function() {
				var left_menu_width = 300;
				var meas_list_width = 280;
				var padding = 20;

				var size = $.window_size();
				$.style("main", size);
				$.style("terminals", {height: (size.height - 50) + "px"});
				$.style("patients", {height: (size.height - 50) + "px"});
				$.$("card").style.width = left_menu_width + "px";
				$.$("abp_meas_list").style.height = (size.height - 60) + "px";
				$.$("abp_analyze").style.width = (size.width - meas_list_width - left_menu_width - padding) + "px";
				$.$("abp_monitoring").style.width = $.$("abp_comment").style.width = (size.width - left_menu_width - 40) + "px";
				if (this.analysis) {
					this.analysis.resize(size.width - left_menu_width - meas_list_width, size.height - 50);
				}
				if (this.ecg_iframe != null) {
					$.style(this.ecg_iframe, {width: size.width - 300, height: size.height - 70});
				}
			}));
		},

		init: function() {
			this.list_view_enabled = true;
			this.menus = {};
			this.analysis = new Analysis($.$("abp_canvas"));
			this.event("resize");
			this.cache = new Cache();
			this.navigation = new Navigation($.$("navigation"), {
				terminal: $.F(this, this.open_terminal),
				patient: $.F(this, this.open_patient),
				meas: $.F(this, this.open_meas),
				tab: $.F(this, this.open_tab),
				panel: $.F(this, this.open_meas_panel)
			}, this.cache);

			var AUTH = this.query({query: "auth"});
			var name = AUTH.user == "admin" ? "Администратор" : "Терминал " + AUTH.user.match(/(\d+)$/)[1];
			$.$("auth_user").innerHTML = name;
			if (AUTH.user != "admin")
				$.hide("tab_terminals");
			this.show_terminals();

			var m;
			if (m = AUTH.user.match(/terminal(\d+)$/)) {
				this.navigation.chroot(Number(m[1]));
			}
			this.navigation.init();
		},

		add_meas_select: function(input) {
			var a = input.value.split(".");
			var extension = a[a.length - 1]; // (String(input.value).match(/.*\.(w+)$/) || [])[1]
			$.$("add_meas_type").value = extension == "txt" ? "АД" : "ЭКГ";
		},

		query: function(query) {
			var xhr = new $.xhr();

			var a = [];
			for (var k in query) {
				a.push(k + "=" + query[k]);
			}
			xhr.open("GET", this.backend + "?" + a.join("&"), false);
			xhr.overrideMimeType('text/plain; charset=x-user-defined');
			xhr.send("");
			return $.json.decode($.OxFF(xhr.responseText));
		},

		post: function(query) {
			var xhr = new $.xhr();

			var a = [];
			for (var k in query) {
				a.push(k + "=" + escape(query[k]));
			}
			xhr.open("POST", this.backend, false);
			xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
			xhr.send(a.join("&"));
			return $.json.decode(xhr.responseText);
		},

		show_terminals: function() {
			var terminals = this.cache.get("terminal");
			if (terminals == null) {
				terminals = [];
				var list = this.query({query: "terminals"});
				$.every(list, function(terminal) {
					terminal.name = $.utf8.decode(terminal.name);
					terminals[Number(terminal.id)] = terminal;
				});
				// console.log("add to cache: %o", terminals)
				this.cache.add("terminal", null, terminals);
			}
			var menu = this.menus.terminals = this.menus.terminals || new Menu("terminals", $.F(this, function(title, terminal) {
				this.navigation.open({type: "terminal", id: terminal.id, title: title});
			}));
			var items = [];
			$.every(terminals, function(terminal) {
				if (terminal)
					items.push([terminal.name, terminal]);
				// navigation.set("terminal", terminal.id, name);
			});
			menu.update(items);
			this.block_main(null);
		},

		open_terminal: function(item, path) {
			try {
				this.open_patient(null);
				$.toggle(item != null, "patients");
				if (item) {
					var menu = this.menus.patients = this.menus.patients || new Menu("patients", $.F(this, function(title, patient) {
						this.navigation.open(null, {type: "patient", id: patient.id, title: title});
					}));
					menu.clear();
					var patients = this.cache.get("patient", item.id);
					if (patients == null) {
						patients = [];
						var list = this.query({query: "patients", terminal: item.id});
						$.every(list, function(patient) {
							patient.name = $.utf8.decode(patient.name);
							patients[Number(patient.id)] = patient;
						});
						this.cache.add("patient", item.id, patients);
					}
					var items = [
						["Добавить карточку", {id: -1}],
						null
					];
					$.every($.map(null, patients).sort(function(a, b) { return a.name > b.name }), function(patient) {
						if (patient)
							items.push([patient.name, patient]);
						// navigation.set("card", patient.id, name);
					});
					menu.update(items);
					this.block_main("terminal");
				}
			} catch(e) {
				$.error("open terminal error: %e", e);
			}
		},

		open_patient: function(item, path) {
			try {
				var current_meas;
				if (item && item.id == -1) {
					add_patient(path.terminal);
					return;
				}
				this.open_meas(null);
				$.clear("patient_name");
				$.hide("card");
				this.block_main(null);
				if (path && path.terminal && path.patient) {
					this.list_view(false);
					// $.hide("terminals", "patients");
					// $.hide("tab_terminals", "tab_patients");
					$.$("patient_name").innerHTML = item.title;
					var card_menu = this.menus.card = this.menus.card || new Menu("card_menu", $.F(this, function(title, id) {
						this.navigation.open(null, null, {type: "tab", id: id, title: title});
					}));
					card_menu.update([
						["Карточка", "info"],
						["Диагноз", "diagnosis"],
						["Мониторирование", "monitor"]
					]);

					var measlist = this.cache.get("meas", [path.terminal, path.patient]);
					if (measlist == null) {
						measlist = this.load_meas_list(path.terminal, path.patient);
					}

					var active_meas;
					var meas_submenu = $.e("div", {'class': "meas_submenu"});
					new Menu(meas_submenu, $.F(this, function(title, id) {
						this.navigation.open(null, null, current_meas, {type: "panel", id: id, title: title});
					})).update([
						["Анализ", "analyze"],
						["Условия мониторирования", "monitoring"],
						["Комментарий", "comment"]
					]);

					var meas_menu = this.menus.measurements = this.menus.measurements || new Menu("meas_list", $.F(this, function(title, meas) {
						current_meas = {type: "meas", id: meas.id, title: title};
						this.navigation.open(null, null, current_meas);
					}));
					var items = [];
					$.every(measlist, function(meas) {
						if (meas) {
							items.push([meas.name, meas, function(element) {
								if (active_meas) {
									meas_submenu.parentNode.removeChild(meas_submenu);
									active_meas.className = null;
								}
								active_meas = element.parentNode; // div
								active_meas.appendChild(meas_submenu);
								active_meas.className = "active_meas";
							}]);
						}
					});
					meas_menu.update(items);
					$.show("card");
					this.block_main("card");
				} else {
					this.list_view(true);
					// $.show("terminals", "patients");
					// $.show("tab_terminals", "tab_patients");
				}
			} catch(e) {
				$.error("open patient error: %e", e);
			}
		},

		list_view: function(enable) {
			this.list_view_enabled = enable;
			if (enable)
				$.show("terminals", "patients");
			else
				$.hide("terminals", "patients");
			window.onresize();
		},

		load_meas_list: function(terminal, patient) {
			var measlist = [];
			var list = this.query({query: "measlist", terminal: terminal, patient: patient});
			$.each(list, function(meas) {
				var date = $.utf8.decode(meas.date || "").split(/[\ :-]/).slice(0, 3).reverse();
				if (!isFinite(Number(date[2]))) {
					var month = date[2];
					date[2] = date[1];
					date[1] = MONTHS[month];
				}
				meas.type = $.utf8.decode(meas.type);
				meas.date = date.join(".");
				meas.comment = $.utf8.decode(meas.comment || "");
				meas.patient = patient;
				meas.terminal = terminal;
				meas.name = $.sprintf("Измерение #%d: %s. %s", meas.id, meas.type, meas.date);
				measlist[Number(meas.id)] = meas;
			});
			this.cache.add("meas", [terminal, patient], measlist);
			return measlist;
		},

		open_meas_panel: function(item, path) {
			try {
				if (item && item.id == "analyze") {
					this.draw_analysis();
				}
				$.toggle(item == null, "abp_canvas");
				$.toggle(item != null && item.id == "analyze", "abp_analyze");
				$.toggle(item != null && item.id == "monitoring", "abp_monitoring");
				$.toggle(item != null && item.id == "comment", "abp_comment");
				$.toggle(item == null || item.id == "analyze", "abp_meas_list");
			} catch(e) {
				$.error("open meas panel error: %e", e);
			}
		},

		draw_analysis: function() {
			var data_analysis = this.analysis.analyze();
			var format = function(value) {
				return value != null && !isNaN(value) ? String(value) : "-";
			};
			var values1 = {
				systolic: "Систолическое АД",
				diastolic: "Диастолическое АД",
				pulse: "ЧСС",
				kerdo: "Индекс Кердо",
				s_kriteria: "Критерий S",
				double_mult: "Двойное произведение"
			};
			var rows1 = [["", "Минимум", "Максимум", "Среднее", "Стандартное отклонение"]];
			var period = $.$("abp_analyze_period").value;
			$.each(values1, function(title, key) {
				var item = data_analysis[period][key];
				rows1.push([title, format(item.min), format(item.max), format(item.mean), format(item.std)]);
			});

			$.every(["systolic", "diastolic"], function(key1) {
				$.every(["hyper", "hypo"], function(key2) {
					$.$("abp_blood_pressure_load_" + key1 + "_" + key2).innerHTML = data_analysis.blood_pressure_load[key1][key2];
					$.$("abp_area_under_curve_" + key1 + "_" + key2).innerHTML = data_analysis.area_under_curve[key1][key2];
				});
			});

			var values2 = {
				day_index: "Суточный индекс",
				speed: "Скорость утреннего повышения"
			};
			var rows2 = [["", "Систолическое АД", "Диастолическое АД"]];
			$.each(values2, function(title, key) {
				var item = data_analysis[key] || {};
				rows2.push([title, format(item.systolic), format(item.diastolic)]);
			});

			var table1 = $.table.apply($, rows1);
			var table2 = $.table.apply($, rows2);
			table1.cellPadding = table2.cellPadding = 5;
			table1.border = table2.border = 1;
			$.clear("abp_analyze_table1").appendChild(table1);
			$.clear("abp_analyze_table2").appendChild(table2);
		},

		open_meas: function(item, path) {
			try {
				this.open_tab(null);
				if (item) {
					var measdata = this.cache.get("measdata", [path.terminal, path.patient, item.id]);
					var meas = this.cache.get("meas", [path.terminal, path.patient, item.id]);
					if (measdata == null) {
						measdata = this.query({query: "meas", terminal: path.terminal, patient: path.patient, meas: item.id});
						this.cache.add("measdata", [path.terminal, path.patient, item.id], measdata);
					}
					$.toggle(meas.type == "АД", "card_meas_abp");
					$.toggle(meas.type == "ЭКГ", "card_meas_ecg");
					if (meas.type == "ЭКГ") {
						var container = $.clear("card_meas_ecg");
						this.ecg_iframe = $.e("iframe", {
							src: "/med/chrome/www/?t=" + Number(new Date()) + "#" + meas.terminal + "/" + meas.patient + "/" + meas.id,
							style: {width: "100%", height: "100%"}
						});
						container.appendChild(this.ecg_iframe);
					} else if (meas.type == "АД") {
						this.analysis.load(measdata);
						this.analysis.drawList($.$("abp_meas_list"));
						this.analysis.draw();
					}
					this.event("resize");
				} else {
					this.analysis.clear();
					$.hide("card_meas_abp", "card_meas_ecg");
				}
			} catch(e) {
				$.error("open meas error: %e", e);
			}
		},

		make_card_info: function(info, terminal, patient) {
			var fields = [
				["Фамилия", "family"],
				["Имя", "name"],
				["Отчество", "surname"],
				["Дата рождения(дд.мм.гггг)", "burthday", "date"],
				["Пол", "sex", "select", [["МУЖ", "мужской"], ["ЖЕН", "женский"]]],
				["Рост", "rost", "numeric"],
				["Вес", "ves", "numeric"],
				["Окружность бедер", "bedro", "numeric"],
				["Окружность талии", "talia", "numeric"],
				["Семейное положение", "marital_status", "select", [["ЖЕНАТ", "женат / замужем"], ["ХОЛОСТ",  "не женат / не замужем"]]],
				["Социальная категория", "social_status", "select", [["0", ""], ["1", "обычная"], ["2", "инвалид ВОВ"], ["3", "участник ВОВ"], ["4", "воин интернационалист"], ["5", "инвалид"]]],
				["Образование", "education"],
				["Место работы", "employment"],
				["Профессия", "profession"],
				["Должность", "post"],
				["Город", "city"],
				["Улица", "street"],
				["Дом", "house_number", "numeric"],
				["Корпус", "house_korpus"],
				["Квартира", "house_unit_number", "numeric"],
				["Домашний телефон", "house_phone"],
				["Служебный телефон", "business_phone"],
				["Серия полиса", "policy_series"],
				["Номер полиса", "policy_number"],
				["Группа диспансерного учета", "dispensary_group"],
			];
			var container = $.clear("card_info");
			var rows = [];
			var width = 280;
			var chomp = function(s) {
				return (s || "").replace(/^\s+/, "").replace(/\s+$/, "");
			};
			var check = {
				date: function() {
					var m;
					if (m = this.value.match(/^(\d\d\d\d)\D(\d\d)\D(\d\d)/)) {
						this.value = m[3] + "." + m[2] + "." + m[1];
					} else if (m = this.value.match(/^(\d\d)\D(\d\d)\D(\d\d\d\d)/)) {
						this.value = m[1] + "." + m[2] + "." + m[3];
					} else if (m = this.value.match(/^(\w+)\s+(\d+)\s+(\d+)/)) {
						this.value = m[2] + "." + MONTHS[m[1]] + "." + m[3];
					}
				},
				numeric: function() {
					var m;
					if ((m = this.value.match(/(\d+)/)) && m[1] > 0) {
						this.value = String(m[1]);
						this.className = null;
					} else {
						this.value = "";
						this.className = "empty";
					}
				},
				string: function() {
					this.className = this.value.match(/\S+/) ? null : "empty";
				}
			};

			$.every(fields, function(field) {
				var title = field[0];
				var value = info ? $.utf8.decode(String(info[field[1]]) || "") : "";
				var type = field[2];
				var control;
				if (type == null || type == "date" || type == "numeric") {
					control = $.e("input", {id: "card_info_" + field[1], type: "text", value: chomp(value), onchange: check[type || "string"], /*readonly: "readonly", */style: {width: width}});
					control.onchange();
				} else if (type == "select") {
					var options = field[3];
					control = $.e("select", {id: "card_info_" + field[1], style: {width: width + 12}});
					$.every(options, function(option) {
						var attr = {value: option[0]};
						if (option[0] == value)
							attr.selected = "selected";
						control.appendChild($.e("option", attr, option[1]));
					});
				}
				rows.push([$.span(title + ":"), control]);
			});
			rows.push(["", $.e("button", {onclick: function() {
				var request = {query: info ? "edit_patient" : "add_patient", terminal: terminal, patient: patient};
				$.every(fields, function(field) {
					var key = "card_info_" + field[1];
					var type = field[2];
					if (type == null || type == "select" || type == "numeric")
						request[key] = $.utf8.encode($.$(key).value);
					else if (type == "date")
						request[key] = $.$(key).value.split(".").reverse().join("-") + " 00:00:00";
				});
				var resp = this.post(request);
				alert(resp);
			}}, info ? "Сохранить" : "Добавить")]);
			container.appendChild($.table.apply($, rows));
			// console.log(info);
		},

		open_tab: function(item, path) {
			try {
				if (item && item.id == "info") {
					var args = [path.terminal, path.patient];
					var info = this.cache.get("patient_info", args);
					if (info == null) {
						info = this.query({query: "patient", terminal: path.terminal, patient: path.patient});
						this.cache.add("patient_info", args, info);
					}
					this.make_card_info(info, path.terminal, path.patient);
				} else if (item && item.id == "diagnosis") {
					var args = [path.terminal, path.patient];
					var info = this.cache.get("patient_diagnosis", args);
					if (info == null) {
						info = this.query({query: "patient", terminal: path.terminal, patient: path.patient});
						this.cache.add("patient_diagnosis", args, info);
					}
					var fields = [
						["Сопутствующие заболевания", "soput_zab", 0],
						["Сахарный диабет", "sah_diabet", 0],
						["Поражение органов мишеней", "por_org_mish", 0],
						["Факторы риска", "f_riska", 0],
						/*
						["Употребление алкоголя", "", 0],
						["Курение", "", 0],
						["Холестерин", "", 0],
						["Уровень стрессов", "", 0],
						["Физическая активность", "", 0],
						*/
					];
					var container = $.clear("card_diagnosis");
					var rows = [];
					var chomp = function(s) {
						return (s || "").replace(/^\s+/, "").replace(/\s+$/, "");
					};
					$.every(fields, function(field) {
						var title = field[0];
						var value = $.utf8.decode(info[field[1]] || "");
						rows.push([
							$.span(title + ":"),
							$.e("input", {type: "text", value: chomp(value), readonly: "readonly", style: {width: 200}})
						]);
					});
					container.appendChild($.table.apply($, rows));
				} else if (item && item.id == "monitor") {
					card_monitoring_update();
				}
				this.block_main(item == null ? "card_meas" : "card_" + item.id);
			} catch(e) {
				$.error("open tab error: %e", e);
			}
		},

		block_main: function(block) {
			// console.log(block)
			$.toggle((block || "").substr(0, 4) == "card", "card_data");
			$.toggle(block == "card_meas", "card_meas");
			$.toggle(block == "card_info", "card_info");
			$.toggle(block == "card_diagnosis", "card_diagnosis");
			$.toggle(block == "card_monitor", "card_monitor");
			$.toggle(block == "terminal", "terminal_info");
		}

	});

	exports.Interface = Interface;
	exports.Analysis = Analysis;
	exports.Menu = Menu;
	exports.Navigation = Navigation;
	exports.Cache = Cache;
	exports.Graph = Graph;

})();
