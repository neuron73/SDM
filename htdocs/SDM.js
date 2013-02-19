(function() {

	var $ = require("utils", "web", "json");

	var str2time = function(str) {
		str = str.split(":");
		return (Number(str[0]) * 60 + Number(str[1])) * 60 * 1000;
	};

	var AUTH;

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

		'extends': $.Eventable,

		initialize: function(container) {
			var self = this;
			this.container = container;
			this.abp_graph = new Graph(container);
			container.onmousemove = function(e) {
				self.abp_graph.on_mouse_move(e);
			};
			this.list = new MeasList(this);
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
					|| measurement[0] > SAD_MAX || measurement[0] < SAD_MIN
					|| measurement[1] > DAD_MAX || measurement[1] < DAD_MIN
					|| measurement[2] > RATE_MAX || measurement[2] < RATE_MIN);
				var error = measurement[4] == '*';
				this.time_s.push(measurement[3]);
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
							var width = (interval.to - interval.from) / 1000 / 60 / 60; // мс. => ч.
							if (points) {
								// console.log(interval);
								var area;
								var under = key2 == "systolic";
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
			var rows = [[bold(loc.sys_abp), bold(loc.dia_abp), bold(loc.rate), bold(loc.time), bold(loc.error)]];
			for (var i = 0; i < this.root.count; i++) {
				var error, sys, dia, pulse;
				if (this.root.errors[i] != null) {
					error = $.span(this.root.errors[i] ? "#" + String(this.root.errors[i]) : "-");
					sys = dia = pulse = "-";
				} else {
					error = $.e("input", {type: "checkbox", n: i, onchange: function() { self.setError(Number(this.getAttribute("n")), this.checked) }});
					error.checked = this.root.artefacts[i] ? true : null;
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
			this.root.artefacts[n] = error ? 0 : null;
			this.event("artefact", this.root.ids[n], error);
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
			this.check();
			if (this.sections[0] == null || ((this.sections[0] || {}).id != terminal_id))
				this.go("#terminal:" + terminal_id);
		},

		draw: function() {
			try {
				var self = this;
				$.clear(this.container);
				this.container.appendChild($.e("a", {href: "", onclick: function() { self.open(false); return false; }}, loc.main));
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
					var div = $.div(e);
					if (item[3]) // active
						div.style.backgroundColor = "#e5e5e5";
					this.container.appendChild(div);
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
		},

		drop: function(type, args) {
			this.add(type, args, null);
		}

	});

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

	var Interface = new $.Class({

		'extends': $.Eventable,

		diagnosis_types: {
			// diabetes: $.qw("diabetes"),														// СД - сахарный диабет
			risk_factor: $.qw("diabetes cholesterol age parents smoking inactivity"),		// ФР - факторы риска
			target_organ: $.qw("hypertrophy proteinuria atherosclerosis retina"),			// ПОМ - поражение органов-мишеней
			clinical_conditions: $.qw("cerebrovascular cardio renal vascular retinopathy")	// АКС - ассоциированные клинические состояния
		},
		risk_factor_keys: ["", "P", "O", "1", "3", "8"],

		initialize: function(backend, cgi_bin) {
			this.backend = backend;
			this.cgi_bin = cgi_bin;
			this.onEvent("add_meas_update", $.F(this, this.add_meas_update));
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
				this.menus.measurements["АД"].update(items);
			}));
			this.onEvent("add_patient", $.F(this, function() {
				this.block_main("card_info");
				this.make_card_info(null, this.navigation.get("terminal"));
			}));
			this.onEvent("card_monitoring_update", $.F(this, function(terminal) {
				var duration = Number($.$("card_monitor_duration").value);
				var start = Math.floor(new Date() / 1000) + 5 * 60;
				var end = start + duration * 60 * 60;
				this.plan = {
					indication: $.$("card_monitor_indication").checked ? 1 : 0,
					interval_active: $.$("card_monitor_interval_active").value,
					interval_passive: $.$("card_monitor_interval_passive").value,
					start: start,
					end: end,
					night_start: NIGHT_TIME_START,
					night_end: NIGHT_TIME_END,
					special: SPECIAL_TIME_START
				};
				/*
				var keys = ["query=plan"];
				for (var k in this.plan) {
					keys.push(k + "=" + this.plan[k]);
				}
				$.$("card_monitor_plan_download").href = this.cgi_bin + "plan_.txt?" + keys.join("&");
				*/

				var xx = function(n) {
					return n < 10 ? "0" + n : n;
				};
				var format = function(date) {
					date = new Date(date * 1000);
					return xx(date.getDate()) + "." + xx(date.getMonth() + 1) + "." + (date.getYear() + 1900) + " " + xx(date.getHours()) + ":" + xx(date.getMinutes());
				};
				$.$("card_monitor_time_start").innerHTML = format(this.plan.start);
				$.$("card_monitor_time_end").innerHTML = format(this.plan.end);

				$.$("card_monitor_active_start").innerHTML = NIGHT_TIME_END + ":00";
				$.$("card_monitor_active_end").innerHTML = NIGHT_TIME_START + ":00";
				$.$("card_monitor_passive_start").innerHTML = NIGHT_TIME_START + ":00";
				$.$("card_monitor_passive_end").innerHTML = NIGHT_TIME_END + ":00";
			}));
			this.onEvent("update_analysis", $.F(this, this.draw_analysis, ["abp_analyze_table1"]));
			this.onEvent("resize", $.F(this, function() {
				var left_menu_width = 265;
				var meas_list_width = 300;
				var padding = 20;

				var size = $.window_size();
				$.style("main", size);
				$.style("terminals", {height: (size.height - 50) + "px"});
				$.style("new_measurements", {height: (size.height - 50) + "px"});
				$.style("patients", {height: (size.height - 50) + "px"});
				$.$("card").style.width = left_menu_width + "px";
				$.$("abp_meas_list").style.height = (size.height - 60) + "px";
				$.$("tab_menu").style.height = (size.height - 40) + "px";
				$.$("abp_analyze").style.width = (size.width - meas_list_width - left_menu_width - padding) + "px";
				$.$("abp_monitoring").style.width = $.$("abp_comment").style.width = $.$("abp_conclusion").style.width = (size.width - left_menu_width  - meas_list_width - 40) + "px";
				if (this.analysis) {
					this.analysis.resize(size.width - left_menu_width - meas_list_width, this.panel ? size.height - 500 : size.height - 50);
				}
				if (this.ecg_iframe != null) {
					$.style(this.ecg_iframe, {width: size.width - 300, height: size.height - 70});
				}
				if (this.abp_iframe != null) {
					$.style(this.abp_iframe, {width: size.width - 340, height: size.height - 60});
				}
			}));
			this.onEvent("save_comment", $.F(this, function() {
				this.query({
					query: "save_comment",
					terminal: this.navigation.get("terminal"),
					patient: this.navigation.get("patient"),
					meas: this.navigation.get("meas"),
					comment: $.$("abp_monitoring_comment").value
				});
			}));
			this.onEvent("save_conclusion", $.F(this, function() {
				this.query({
					query: "save_conclusion",
					terminal: this.navigation.get("terminal"),
					patient: this.navigation.get("patient"),
					meas: this.navigation.get("meas"),
					conclusion: $.$("abp_monitoring_conclusion").value
				});
			}));
			this.onEvent("grade_update", $.F(this, function() {
				this.grade_update();
				this.diagnosis_save(this.navigation.get("terminal"), this.navigation.get("patient"));
			}));

			this.monitor_dispatcher_URL = "http://localhost:18345/";

			if (window.addEventListener)
				window.addEventListener("message", $.F(this, this.monitor_listener), false);
			else
				window.attachEvent("onmessage", $.F(this, this.monitor_listener));
		},

		grade_update: function() {
			var types = {
				diabetes: $.qw("diabetes"),														// СД - сахарный диабет
				risk_factor: $.qw("diabetes cholesterol age parents smoking inactivity"),		// ФР - факторы риска
				target_organ: $.qw("hypertrophy proteinuria atherosclerosis retina"),			// ПОМ - поражение органов-мишеней
				clinical_conditions: $.qw("cerebrovascular cardio renal vascular retinopathy")	// АКС - ассоциированные клинические состояния
			};
			var risks = [
				[loc.low_risk,			"#ffffff",	"black"],		// 0
				[loc.average_risk,		"#aa4400",	"white"],		// 1
				[loc.high_risk,			"#ff0000",	"white"],		// 2
				[loc.very_high_risk,	"#ff0000",	"white"],		// 3
			];
			var insult_risks = [
				loc.risk_lt15, 		// низкий риск
				loc.risk_15_20,		// средний риск
				loc.risk_20_30,		// высокий риск
				loc.risk_gt30		// очень высокий риск
			];
			var grades = [	// Определение степени риска (из приказа №4 мин-ва здравоохранения от 24 янв 2003г "организация мед помощи больным с АГ")
				null,		//										1-я степень АГ		2-я степень АГ		3-я степень АГ
				[0, 1, 2],	// I. Нет ФР, ПОМ, АКС						низкий				средний				высокий
				[1, 1, 3],	// II. 1-2 фактора риска (кроме СД)			средний				средний				оч.высокий
				[2, 2, 3],	// III. 3 и более ФР или ПОМ или СД			высокий				высокий				оч.высокий
				[3, 3, 3]	// IV. АКС									оч.высокий			оч.высокий			оч.высокий
			];
			var marked = {};
			$.each(types, function(keys, type) {
				marked[type] = 0;
				$.every(keys, function(key) {
					if ($.$("ah_" + key).checked)
						marked[type]++;
				});
			});
			var n_grade;
			if (marked.clinical_conditions > 0)
				n_grade = 4;
			else if (marked.risk_factor + marked.target_organ >= 3 || marked.diabetes)
				n_grade = 3;
			else if (marked.risk_factor > 0 || marked.target_organ > 0)
				n_grade = 2;
			else
				n_grade = 1;

			var hypertension_grade = Math.max(0, Number($.$("hypertension_grade").value) - 4);
			var risk_grade = grades[n_grade][hypertension_grade];
			$.$("hypertension_risk").innerHTML = "&nbsp;" + risks[risk_grade][0] + "&nbsp;";
			$.style("hypertension_risk", {backgroundColor: risks[risk_grade][1], color: risks[risk_grade][2]});
			$.$("insult_risk").innerHTML = insult_risks[risk_grade];
		},

		add_meas_update: function() {
			var a = $.$("add_meas_input").value.split(".");
			var extension = a[a.length - 1]; // (String(input.value).match(/.*\.(w+)$/) || [])[1]
			$.$("add_meas_type").value = extension == "txt" ? "АД" : "ЭКГ";
			$.$("add_meas_terminal").value = this.navigation.get("terminal");
			$.$("add_meas_patient").value = this.navigation.get("patient");
		},

		init: function() {
			this.list_view_enabled = true;
			this.menus = {};
			this.analysis = new Analysis($.$("abp_canvas"));
			this.analysis.onEvent("artefact", $.F(this, function(n, error) {
				this.query({
					query: "artefact",
					terminal: this.navigation.get("terminal"),
					patient: this.navigation.get("patient"),
					meas: this.navigation.get("meas"),
					n: n,
					error: error ? 1 : 0
				});
			}));
			this.event("resize");
			this.cache = new Cache();
			this.navigation = new Navigation($.$("navigation"), {
				terminal: $.F(this, this.open_terminal),
				patient: $.F(this, this.open_patient),
				meas: $.F(this, this.open_meas),
				tab: $.F(this, this.open_tab),
				panel: $.F(this, this.open_meas_panel)
			}, this.cache);

			AUTH = this.query({query: "auth"});
			var name = AUTH.user == "admin" ? loc.admin : loc.terminal + AUTH.user.match(/(\d+)$/)[1];
			$.$("auth_user_name").innerHTML = name;
			if (AUTH.user != "admin") {
				$.hide("tab_terminals");
			}
			this.requests = this.query({
				query: "get_requests"
			});
			this.show_terminals();

			this.navigation.init();

			var m;
/*
			if (AUTH.user == "admin") {
				this.requests = this.query({
					query: "get_requests"
				});
				if (requests.length > 0) {
				}
			} else */ if (m = AUTH.user.match(/terminal(\d+)$/)) {
				this.navigation.chroot(Number(m[1]));
			}
		},

		logout: function() {
			var xhr = new $.xhr();
			xhr.open("GET", this.backend + "?query=logout", true, "aaa", "aaa");
			xhr.send("");
			xhr.abort();
			window.location = "/SDM/logout.html";
		},

		query: function(query) {
			var xhr = new $.xhr();

			var a = [];
			for (var k in query) {
				a.push(k + "=" + query[k]);
			}
			xhr.open("GET", this.backend + "?" + a.join("&"), false);
			if (xhr.overrideMimeType)
				xhr.overrideMimeType('text/plain; charset=x-user-defined');
			xhr.send("");

			// IE 9
			var r = xhr.overrideMimeType ? xhr.responseText : $.map(function(_) { return String.fromCharCode(_) }, VBArray(xhr.responseBody).toArray()).join("");
			return $.json.decode($.OxFF(r));
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

		make_plan: function() {
			var date_start = Number(this.plan.start);
			var date_end = Number(this.plan.end);
			var night_time_start = Number(this.plan.night_start);
			var night_time_end = Number(this.plan.night_end);
			var special_time = Number(this.plan.special);

			var plan = [];
			plan[0] = "USB";
			// ФЛАГ ВЫВОДА РЕЗУЛЬТАТОВ НА ИНДИКАЦИЮ ВО ВРЕМЯ МОНИТОРИНГА
			plan[1] = this.plan.indication;
			// КОД ОПЦИЙ РЕАКЦИЙ МОНИТОРА НА ОШИБКИ: всегда константа 3.
			plan[2] = 3;
			// СТАРТОВОЕ ЗНАЧЕНИЕ ПОРОГА НАГНЕТАНИЯ ДАВЛЕНИЯ В ММ РТ.СТ.: 0, 100 ... 290. (Если 0, то монитор использует стандартное значение.)
			plan[3] = 0;
			// ШАГ ПОДКАЧКИ ДАВЛЕНИЯ В ММ РТ.СТ.:	0, 20 ... 60. (Если 0, то монитор использует стандартное значение.)
			plan[4] = 0;
			// ПРЕДЕЛЬНОЕ ЗНАЧЕНИЕ ПОДКАЧКИ ДАВЛЕНИЯ В ММ РТ.СТ.: 0, 20 ... 195. (Если 0, то монитор использует стандартное значение.)
			plan[5] = 0;
			// МЛАДШИЙ БАЙТ ВРЕМЕНИ НАЧАЛА АКТИВНОГО ПЕРИОДА В МИНУТАХ С НАЧАЛА СУТОК: 0 ... 255
			plan[6] = (night_time_end * 60) & 0xFF;
			// СТАРШИЙ БАЙТ ВРЕМЕНИ НАЧАЛА АКТИВНОГО ПЕРИОДА В МИНУТАХ С НАЧАЛА СУТОК: 0 ... 5.
			plan[7] = (night_time_end * 60) >> 8;
			// МЛАДШИЙ БАЙТ ВРЕМЕНИ ОКОНЧАНИЯ АКТИВНОГО ПЕРИОДА В МИНУТАХ С НАЧАЛА СУТОК: 0 ... 255.
			plan[8] = (night_time_start * 60) & 0xFF;
			// СТАРШИЙ БАЙТ ВРЕМЕНИ ОКОНЧАНИЯ АКТИВНОГО ПЕРИОДА В МИНУТАХ С НАЧАЛА СУТОК: 0 ... 5.
			plan[9] = (night_time_start * 60) >> 8;
			var n = 0;
			var date;
			while (date_start <= date_end) {
				date = new Date(date_start * 1000);
				// МИНУТЫ ВРЕМЕНИ ЗАПУСКА ИЗМЕРЕНИЯ НА ТОЧКЕ i: 0 ... 59.
				plan[10 + n * 2] = date.getMinutes();
				// ЧАСЫ ВРЕМЕНИ ЗАПУСКА ИЗМЕРЕНИЯ НА ТОЧКЕ i: 0 ... 23.
				plan[11 + n * 2] = date.getHours();
				var interval = (date.getHours() >= special_time && date.getHours() < night_time_start) ? Number(this.plan.interval_active) : Number(this.plan.interval_passive);
				date_start += interval * 60;
				n++;
			}
			return plan.join("-") + "-";
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
				$.every(this.requests, function(patient) {
					var terminal = Number(patient.terminal);
					if (terminals[terminal]) {
						terminals[terminal].requests = terminals[terminal].requests || [];
						terminals[terminal].requests.push(patient);
					}
				});
				// console.log("add to cache: %o", terminals)
				this.cache.add("terminal", null, terminals);
			}
			var menu = this.menus.terminals = this.menus.terminals || new Menu("terminals", $.F(this, function(title, terminal) {
				this.navigation.open({type: "terminal", id: terminal.id, title: title});
			}));
			var items = [];
			$.every(terminals, function(terminal) {
				if (terminal) {
					var requests = (terminal.requests || []).length;
					items.push([terminal.name + (requests > 0 ? " [" + requests+ "]" : ""), terminal, null, requests > 0]);
				}
				// navigation.set("terminal", terminal.id, name);
			});
			menu.update(items);
			this.block_main("main");
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
						[loc.add_card, {id: -1}],
						null
					];
					$.every($.map(null, patients).sort(function(a, b) { return a.name > b.name }), function(patient) {
						if (patient)
							items.push([patient.name, patient]);
						// navigation.set("card", patient.id, name);
					});
					menu.update(items);

					var menu2 = this.menus.new_meas = this.menus.new_meas || new Menu("new_measurements", $.F(this, function(title, meas) {
						if (meas.id != -1) {
							if (AUTH.user != "admin") {
								this.post({
									query: "mark_viewed",
									patient: meas.patient,
									meas: meas.meas
								});
							}
							this.navigation.open(null, {type: "patient", id: meas.patient, title: $.utf8.decode(meas.name)}, {type: "meas", id: meas.meas});
						}
					}));
					var items2 = [
						[AUTH.user == "admin" ? loc.new_measurements : loc.reviewed_measurements, {id: -1}],
						null
					];
					var terminals = this.cache.get("terminal");
					var count;
					$.every(terminals, function(terminal) {
						if (terminal && terminal.id == item.id) {
							count = (terminal.requests || []).length;
							$.every(terminal.requests || [], function(meas) {
								items2.push([$.utf8.decode(meas.name) + ", #" + meas.meas, meas]);
							});
						}
					});
					if (count > 0)
						menu2.update(items2);
					else
						menu2.clear();

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
						[loc.card_info, "info"],
						[loc.card_history, "history"],
						[loc.diagnosis, "diagnosis"],
						[loc.new_monitoring, "monitor"],
						[loc.new_meas, "test"]
					]);

					var measlist = this.cache.get("meas", [path.terminal, path.patient]);
					if (measlist == null) {
						measlist = this.load_meas_list(path.terminal, path.patient);
					}

					function get_submenu(meas) {
						if (meas.type == "АД") {
							var items = [
								[loc.analysis, "analyze"],
								[loc.conditions, "monitoring"],
								// [loc.events, "events"],
								[loc.comment, "comment"],
							];

							if (AUTH.user != "admin") {
								if (meas.review_time != null) {
									items = items.concat([
										[loc.report, "report"],
										[loc.conclusion, "conclusion"],
									]);
								} else if (meas.request_time == null) {
									items = items.concat([
										[loc.send, "send"],
									]);
								}
							} else {
								items = items.concat([
									[loc.report, "report"],
									[loc.conclusion, "conclusion"],
								]);
								if (meas.request_time != null && meas.review_time == null) {
									items = items.concat([
										[loc.mark_reviewed, "mark_reviewed"],
									]);
								}
							}
							return items;
						}
					}

					var active_meas;
					var active_meas_div;
					var active_meas_type;
					var meas_submenu = {};
					var submenu = new Menu(meas_submenu["АД"] = $.e("div", {'class': "meas_submenu"}), $.F(this, function(title, id) {
						if (id == "send") {
							if (confirm(loc.send_confirm)) {
								this.send_meas();
								active_meas.request_time = true;
								submenu.update(get_submenu(active_meas));
							}
						} else if (id == "mark_reviewed") {
							if (confirm(loc.confirm_reviewed)) {
								this.mark_reviewed();
								active_meas.review_time = true;
								submenu.update(get_submenu(active_meas));
							}
						} else {
							this.navigation.open(null, null, current_meas, {type: "panel", id: id, title: title});
						}
					}));

					meas_submenu["ЭКГ"] = $.div();
					meas_submenu["ИАД"] = $.div();

					var types = ["АД", "ИАД", "ЭКГ"];
					var containers = ["monitoring", "abpm", "ecg"];
					var items = {};
					this.menus.measurements = this.menus.measurements || {};
					$.every(types, function(type, index) {
						this.menus.measurements[type] = this.menus.measurements[type] || new Menu(containers[index] + "_list", $.F(this, function(title, meas) {
							current_meas = {type: "meas", id: meas.id, title: title};
							this.navigation.open(null, null, current_meas);
						}));
						items[type] = [];
					}, this);

					$.every(measlist, function(meas) {
						if (meas) {
							meas.type = meas.type || "АД";
							items[meas.type].push([meas.name, meas, function(element) { // click callback
								if (active_meas) {
									meas_submenu[active_meas_type].parentNode.removeChild(meas_submenu[active_meas_type]);
									active_meas_div.className = null;
								}
								submenu.update(get_submenu(meas));
								active_meas = meas;
								active_meas_div = element.parentNode; // div
								active_meas_div.appendChild(meas_submenu[active_meas_type = meas.type]);
								active_meas_div.className = "active_meas";
							}]);
						}
					});

					$.every(types, function(type, index) {
						$.toggle(items[type].length > 0, containers[index] + "_list_title");
						this.menus.measurements[type].update(items[type]);
					}, this);

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
				var date = $.utf8.decode(meas.date || "").split(/[\ :-]+/).slice(0, 3).reverse();
				if (!isFinite(Number(date[2]))) {
					var month = date[2];
					date[2] = (Number(date[1]) < 10 ? "0" : "") + date[1];
					date[1] = MONTHS[month];
				}
				meas.type = $.utf8.decode(meas.type);
				meas.date = date.join(".");
				meas.comment = $.utf8.decode(meas.comment || "");
				meas.diagnosis = $.utf8.decode(meas.diagnosis || "");
				meas.patient = patient;
				meas.terminal = terminal;
				meas.dinner_time = this.s2time(meas.dinner_time);
				meas.sleep_time = this.s2time(meas.sleep_time);
				meas.meas_before = this.s2abp(meas.meas_before);
				meas.meas_after = this.s2abp(meas.meas_after);
				var name = meas.type == "ИАД" ? loc.measurement : loc.monitoring;
				meas.name = $.sprintf("%s #%d: %s", name, meas.id, meas.date);
				measlist[Number(meas.id)] = meas;
			}, this);
			this.cache.add("meas", [terminal, patient], measlist);
			return measlist;
		},

		send_meas: function() {
			this.post({
				query: "send_meas",
				terminal: this.navigation.get("terminal"),
				patient: this.navigation.get("patient"),
				meas: this.navigation.get("meas"),
			});
		},

		mark_reviewed: function() {
			this.post({
				query: "mark_reviewed",
				terminal: this.navigation.get("terminal"),
				patient: this.navigation.get("patient"),
				meas: this.navigation.get("meas"),
			});
		},

		save_meas: function() {
		},

		open_meas_panel: function(item, path) {
			try {
				this.panel = item && item.id;
				if (this.panel == "report") {
					this.generate_report($.$("abp_report"), path);
					$.hide("tab_menu");
					$.$("header").style.display = "none";
					$.hide("abp_meas_list");
					$.hide("abp_canvas");
					$.show("abp_report");
				} else if (this.panel == "events") {
					$.show("abp_meas_list");
					$.hide("abp_canvas");
					$.hide("abp_report");
				} else {
					$.show("tab_menu");
					$.$("header").style.display = "inline";
					$.show("abp_meas_list");
					$.show("abp_canvas");
					$.hide("abp_report");

					if (item) {
						if (item.id == "analyze")
							this.draw_analysis("abp_analyze_table1");
					}
				}

				$.toggle(item != null && item.id == "analyze", "abp_analyze");
				$.toggle(item != null && item.id == "monitoring", "abp_monitoring");
				$.toggle(item != null && item.id == "comment", "abp_comment");
				$.toggle(item != null && item.id == "conclusion", "abp_conclusion");

				this.event("resize");
			} catch(e) {
				$.error("open meas panel error: %e", e);
			}
		},

		generate_report: function(container, path) {
			var info = this.get_patient_info(path.terminal, path.patient);
			var meas = this.cache.get("meas", [path.terminal, path.patient, path.meas]);

			function format(n, digits) {
				digits = Math.pow(10, digits);
				if (isFinite(n))
					return String(Math.round(n * digits) / digits);
				return "-";
			}

			// console.log(path);
			// console.log(meas);
			var gender = $.utf8.decode(String(info.sex || ""));
			var report_info_rows = [
				[loc.card_number, path.patient],
				[loc.patient, info.name + " " + info.surname + " " + info.family],
				[loc.gender, gender == "МУЖ" ? loc.male : (gender == "ЖЕН" ? loc.female : "-")],
				[loc.dob2, info.burthday],
				[loc.weight, info.ves],
				[loc.height, info.rost],
				[loc.age, "-"],
				[loc.hip, info.bedro],
				[loc.waist, info.talia],
				[loc.hip_waist_index, format(info.bedro > 0 && info.talia > 0 ? info.talia / info.bedro : 0, 2)],
				[loc.weight_index, String(info.ves > 0 && info.rost > 0 ? Math.round(info.ves / info.rost / info.rost * 10000) : 0)],
				[loc.meas_date, meas.date + " " + meas.time],
			];
			$.every(report_info_rows, function(row) {
				row[1] = $.utf8.decode(row[1]);
			});
			$.clear("report_info").appendChild($.table.apply($, report_info_rows).format(null, [{width: 300}]));

			$.$("report_comment").innerHTML = $.utf8.decode(meas.comment).replace(/\n/g, "<br />");
			$.$("report_diagnosis").innerHTML = $.utf8.decode(meas.diagnosis).replace(/\n/g, "<br />");

			this.draw_analysis("report_analysis", true);

			var report_graph = new Graph($.$("report_canvas"));
			report_graph.resize(1000, 700);
			report_graph.update(this.analysis.systolic, this.analysis.diastolic, this.analysis.time, this.analysis.pulse, this.analysis.errors, this.analysis.artefacts);
			report_graph.plot();

			var rows = [[loc.number, loc.time, loc.sys_abp, loc.dia_abp, loc.pulse_abp, loc.rate, loc.error2, loc.double_product, loc.criterion_s, loc.kerdo]];
			var a = this.analysis;
			$.every(a.systolic, function(data, i) {
				var error = "";
				if (a.errors[i] != null)
					error = String(a.errors[i]);
				else if (a.artefacts[i] != null)
					error = "*";
				var b = a.analysis.full.data;
				rows.push([
					String(i + 1),
					String(a.time_s[i]),
					String(a.systolic[i]),
					String(a.diastolic[i]),
					format(b.pulse_bp[i], 0),
					String(a.pulse[i]),
					error,
					format(b.double_product[i], 2),
					format(b.s_kriteria[i], 1),
					format(b.kerdo[i], 2)
				]);
			});
			var table = $.table.apply($, rows);
			table.border = 1;
			table.cellPadding = 5;
			table.style.marginTop = "20px";
			$.$("report_analysis").appendChild(table);
		},

		draw_analysis: function(container, full) {
			var data_analysis = this.analysis.analyze();
			var format = function(value) {
				return value != null && !isNaN(value) ? String(value) : "-";
			};
			var values = {
				systolic: [loc.sys_abp2, loc.sys_abp3],
				diastolic: [loc.dia_abp2, loc.dia_abp3],
				pulse_bp: [loc.pulse_bp, loc.pulse_bp2],
				pulse: [loc.rate2, loc.rate2],
				kerdo: [loc.kerdo, loc.kerdo2],
				s_kriteria: [loc.criterion_s, loc.criterion_s2],
				double_product: [loc.double_product, loc.double_product2]
			};
			var periods = [["day", loc.active_period], ["night", loc.passive_period], ["full", loc.full_period]];
			var table1;
			if (full) {
				var rows = [];
				var header1 = [""];
				var header2 = [];
				$.every(periods, function(period) {
					header1.push(period[1]);
					header2 = header2.concat([loc.maximum, loc.average, loc.minimum, loc.stdev]);
				});
				rows.push(header1);
				rows.push(header2);
				$.each(values, function(name, key) {
					var line = [name[0]];
					$.every(periods, function(period) {
						var item = data_analysis[period[0]][key];
						line = line.concat([format(item.max), format(item.mean), format(item.min), format(item.std)]);
					}, this);
					rows.push(line);
				});
				table1 = $.table.apply($, rows);
				var format1 = [null];

				table1.format([{whiteSpace: "nowrap", textAlign: "left"}]);
				table1.format(null, [{rowSpan: 2}, {colSpan: 4}, {colSpan: 4}, {colSpan: 4}], 0);
				table1.style.marginTop = "20px";
			} else {
				var rows = [["", loc.maximum, loc.average, loc.minimum, loc.stdev]];
				var period = $.$("abp_analyze_period").value;
				$.each(values, function(name, key) {
					var item = data_analysis[period][key];
					var title = $.e("span", {title: name[1], style: {cursor: name[1] != null ? "help" : null}}, [name[0]]);
					rows.push([title, format(item.max), format(item.mean), format(item.min), format(item.std)]);
				});
				table1 = $.table.apply($, rows);
				table1.format(null, [null, {align: "center"}, {align: "center"}, {align: "center"}, {align: "center"}]);
			}

			table1.width = 580;
			table1.cellPadding = 5;
			table1.border = 1;
			$.clear(container).appendChild(table1);

			if (full) {
				var header1 = [""];
				var header2 = [];
				var header3 = [];
				$.every(periods, function(period) {
					header1.push(period[1]);
					header2 = header2.concat([loc.sys_abp, loc.dia_abp]);
					header3 = header3.concat([loc.hypertension, loc.hypotension, loc.hypertension, loc.hypotension]);
				});

				var line1 = [loc.pressure_load];
				var line2 = [loc.area_under_curve];
				$.every(periods, function(period) {
					$.every(["systolic", "diastolic"], function(key1) {
						$.every(["hyper", "hypo"], function(key2) {
							line1.push(String(data_analysis[period[0]].blood_pressure_load[key1][key2]));
							line2.push(String(data_analysis[period[0]].area_under_curve[key1][key2]));
						});
					});
				});
				var table2 = $.table.apply($, [header1, header2, header3, line1, line2]);
				table2.format([{whiteSpace: "nowrap", textAlign: "left"}], null, 3);
				table2.format([{whiteSpace: "nowrap", textAlign: "left"}], null, 4);
				table2.format(null, [{rowSpan: 3}, {colSpan: 4}, {colSpan: 4}, {colSpan: 4}], 0);
				table2.format(null, [{colSpan: 2}, {colSpan: 2}, {colSpan: 2}, {colSpan: 2}, {colSpan: 2}, {colSpan: 2}], 1);
				table2.width = 580;
				table2.cellPadding = 5;
				table2.border = 1;
				table2.style.marginTop = "20px";
				$.$(container).appendChild(table2);

				var header = ["", loc.sys_abp, loc.dia_abp];
				var line1 = [loc.daily_index];
				var line2 = [loc.morning_speed];
				$.every(["systolic", "diastolic"], function(key1) {
					line1.push(format(data_analysis.day_index[key1]));
					line2.push(format(data_analysis.speed[key1]));
				});
				var table3 = $.table.apply($, [header, line1, line2]);
				table3.format([{whiteSpace: "nowrap", textAlign: "left"}]);
				table3.cellPadding = 5;
				table3.border = 1;
				table3.style.marginTop = "20px";
				$.$(container).appendChild(table3);
			} else {
				$.every(["systolic", "diastolic"], function(key1) {
					$.every(["hyper", "hypo"], function(key2) {
						$.$("abp_blood_pressure_load_" + key1 + "_" + key2).innerHTML = data_analysis[period].blood_pressure_load[key1][key2];
						$.$("abp_area_under_curve_" + key1 + "_" + key2).innerHTML = data_analysis[period].area_under_curve[key1][key2];
					});
					$.$("daily_index_" + key1).innerHTML = format(data_analysis.day_index[key1]);
					$.$("morning_speed_" + key1).innerHTML = format(data_analysis.speed[key1]);
				});
			}
		},

		get_meas_data: function(terminal, patient, meas) {
			var measdata = this.cache.get("measdata", [terminal, patient, meas]);
			if (measdata == null) {
				measdata = this.query({query: "meas", terminal: terminal, patient: patient, meas: meas});
				this.cache.add("measdata", [terminal, patient, meas], measdata);
			}
			return measdata;
		},

		open_meas: function(item, path) {
			try {
				this.open_tab(null);
				if (item) {
					var meas = this.cache.get("meas", [path.terminal, path.patient, item.id]);
					var measdata = this.get_meas_data(path.terminal, path.patient, item.id);
					$.toggle(meas.type == "АД", "card_meas_abp");
					$.toggle(meas.type == "ЭКГ", "card_meas_ecg");
					$.toggle(meas.type == "ИАД", "card_meas_abpm");
					if (meas.type == "ЭКГ") {
						var container = $.clear("card_meas_ecg");
						this.ecg_iframe = $.e("iframe", {
							src: "/med/chrome/www/?t=" + Number(new Date()) + "#" + meas.terminal + "/" + meas.patient + "/" + meas.id,
							style: {width: "100%", height: "100%"}
						});
						container.appendChild(this.ecg_iframe);
					} else if (meas.type == "АД") {
						var comment = $.$("abp_monitoring_comment");
						var conclusion = $.$("abp_monitoring_conclusion");
						var comment_save = $.$("abp_monitoring_comment_save");
						var conclusion_save = $.$("abp_monitoring_conclusion_save");

						if (AUTH.user == "admin") {
							comment.setAttribute("readonly", true);
							comment.className = "disabled";
							$.hide(comment_save);
						} else {
							comment.removeAttribute("readonly");
							comment.className = null;
							$.show(comment_save);
						}
						comment.value = meas.comment;

						if (AUTH.user != "admin") {
							conclusion.setAttribute("readonly", true);
							conclusion.className = "disabled";
							$.hide(conclusion_save);
						} else {
							conclusion.removeAttribute("readonly");
							conclusion.className = null;
							$.show(conclusion_save);
						}
						conclusion.value = meas.diagnosis;

						$.$("time_sleep").value = meas.sleep_time[0] || "";
						$.$("time_wake_up").value = meas.sleep_time[1] || "";
						$.$("time_breakfast").value = meas.dinner_time[0] || "";
						$.$("time_lunch").value = meas.dinner_time[1] || "";
						$.$("time_dinner").value = meas.dinner_time[2] || "";
						$.$("meas_before_1").value = meas.meas_before[0] || "";
						$.$("meas_before_2").value = meas.meas_before[1] || "";
						$.$("meas_before_3").value = meas.meas_before[2] || "";
						$.$("meas_after_1").value = meas.meas_after[0] || "";
						$.$("meas_after_2").value = meas.meas_after[1] || "";
						$.$("meas_after_3").value = meas.meas_after[2] || "";

						this.analysis.load(measdata);
						this.analysis.drawList($.$("abp_meas_list"));
						this.analysis.draw();
					} else if (meas.type == "ИАД") {
						this.abp_iframe = $.e("iframe", {
							src: "/ABP/#meas:" + meas.terminal + "-" + meas.patient + "-" + meas.id,
							style: {width: "100%", height: "100%", border: 0}
						});
						$.inject($.clear("card_meas_abpm"), this.abp_iframe);
					}
					this.event("resize");
				} else {
					this.analysis.clear();
					$.hide("card_meas_abp", "card_meas_ecg", "card_meas_abpm");
				}
			} catch(e) {
				$.error("open meas error: %e", e);
			}
		},

		s2time: function(s) {
			var time = [];
			if (s && s.match(/\S+/)) {
				var a = s.split(";");
				for (var i = 0; i < a.length; i += 2) {
					time.push(a[i] + ":" + ((a[i + 1] || "").length == 1 ? "0" : "") + a[i + 1]);
				}
			}
			return time;
		},

		time2s: function(time) {
		},

		s2abp: function(s) {
			var abp = [];
			if (s) {
				var a = s.split(";");
				for (var i = 0; i < a.length; i += 2) {
					abp.push(a[i] != "0" && a[i + 1] != "0" ? a[i] + "/" + a[i + 1] : "");
				}
			}
			return abp;
		},

		make_card_info: function(info, terminal, patient) {
			var fields = [
				[loc.surname, "family"],
				[loc.name, "name"],
				[loc.second_name, "surname"],
				[loc.dob, "burthday", "date"],
				[loc.sex, "sex", "select", [["", ""], ["МУЖ", loc.male], ["ЖЕН", loc.female]]],
				[loc.height, "rost", "numeric"],
				[loc.weight, "ves", "numeric"],
				[loc.hip, "bedro", "numeric"],
				[loc.waist, "talia", "numeric"],
				[loc.marital_status, "marital_status", "select", [["", ""], ["ЖЕНАТ", loc.married], ["ХОЛОСТ",  loc.single]]],
				[loc.soc_category, "social_status", "select", [["0", ""], ["1", "обычная"], ["2", "инвалид ВОВ"], ["3", "участник ВОВ"], ["4", "воин интернационалист"], ["5", "инвалид"]]],
				[loc.education, "education"],
				[loc.company, "employment"],
				[loc.profession, "profession"],
				[loc.position, "post"],
				[loc.city, "city"],
				[loc.street, "street"],
				[loc.house, "house_number", "numeric"],
				[loc.building, "house_korpus"],
				[loc.appart, "house_unit_number", "numeric"],
				[loc.phone1, "house_phone"],
				[loc.phone2, "business_phone"],
				[loc.policy_series, "policy_series"],
				[loc.policy_number, "policy_number"],
				[loc.dispensary_group, "dispensary_group"],
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
				var value = info ? $.utf8.decode(String(info[field[1]] || "")) : "";
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
			rows.push(["", $.e("button", {onclick: $.F(this, function() {
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
				// alert(resp);
				var id = Number(resp);
				if (id > 0) {
					this.cache.drop("patient", [terminal]);
					if (info) {
						this.cache.drop("patient_info", [terminal, patient]);
						alert(loc.card_changed);
					} else {
						this.navigation.open({type: "terminal", id: terminal});
						alert(loc.card_created);
					}
				} else {
					alert(loc.card_create_error);
				}
			})}, info ? loc.save : loc.add)]);
			container.appendChild($.table.apply($, rows));
			// console.log(info);
		},

		get_patient_info: function(terminal, patient) {
			var args = [terminal, patient];
			var info = this.cache.get("patient_info", args);
			if (info == null) {
				info = this.query({query: "patient", terminal: terminal, patient: patient});
				this.cache.add("patient_info", args, info);
			}
			return info;
		},

		diagnosis_load: function(terminal, patient) {
			var info = this.get_patient_info(terminal, patient);

			$.$("hypertension_grade").value = info.stepen_ag;

			$.every(this.diagnosis_types.clinical_conditions, function(key, i) {
				$.$("ah_" + key).checked = info.soput_zab && info.soput_zab.match(String(i + 1));
			}, this);
			$.every(this.diagnosis_types.target_organ, function(key, i) {
				$.$("ah_" + key).checked = info.por_org_mish && info.por_org_mish.match(String(i + 1));
			}, this);
			$.every(this.diagnosis_types.risk_factor, function(key, i) {
				$.$("ah_" + key).checked = info.f_riska && info.f_riska.match(new RegExp("[" + this.risk_factor_keys[i] + "]"));
			}, this);
			$.$("ah_diabetes").checked = info.sah_diabet.match(/^[ZU]$/);
			this.grade_update();
		},

		diagnosis_save: function(terminal, patient) {
			var info = {
				soput_zab: "",
				por_org_mish: "",
				f_riska: ""
			};
			$.every(this.diagnosis_types.clinical_conditions, function(key, i) {
				info.soput_zab += $.$("ah_" + key).checked ? String(i + 1) : "";
			}, this);
			$.every(this.diagnosis_types.target_organ, function(key, i) {
				info.por_org_mish += $.$("ah_" + key).checked ? String(i + 1) : "";
			}, this);
			$.every(this.diagnosis_types.risk_factor, function(key, i) {
				info.f_riska += $.$("ah_" + key).checked ? this.risk_factor_keys[i] : "";
			}, this);
			info.sah_diabet = $.$("ah_diabetes").checked ? "Z" : " ";

			var request = {query: "edit_patient", terminal: terminal, patient: patient};
			$.each(info, function(value, key) {
				request["card_info_" + key] = value;
			});
			request["card_info_stepen_ag"] = $.$("hypertension_grade").value;
			var resp = this.post(request);
		},

		open_tab: function(item, path) {
			try {
				if (item && item.id == "info") {
					var info = this.get_patient_info(path.terminal, path.patient);
					this.make_card_info(info, path.terminal, path.patient);
				} else if (item && item.id == "diagnosis") {
					this.diagnosis_load(path.terminal, path.patient);
/*
					var fields = [
						["Сопутствующие заболевания", "soput_zab", 0],
						["Сахарный диабет", "sah_diabet", 0],
						["Поражение органов мишеней", "por_org_mish", 0],
						["Факторы риска", "f_riska", 0],
						["Употребление алкоголя", "", 0],
						["Курение", "", 0],
						["Холестерин", "", 0],
						["Уровень стрессов", "", 0],
						["Физическая активность", "", 0],
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
*/
				} else if (item && item.id == "monitor") {
					card_monitoring_update();
				} else if (item && item.id == "test") {
					this.abp_iframe = $.e("iframe", {
						src: "/ABP/#test",
						style: {width: "100%", height: "100%", border: 0}
					});
					$.inject($.clear("card_test"), this.abp_iframe);
					this.event("resize");
				} else if (item && item.id == "history") {
					this.make_history(path);
				}
				this.block_main(item == null ? "card_meas" : "card_" + item.id);
			} catch(e) {
				$.error("open tab error: %e", e);
			}
		},

		make_history: function(path) {
			var measlist = this.cache.get("meas", [path.terminal, path.patient]);
			var rows = [];
			$.every(measlist, function(meas) {
				if (meas && meas.type == "АД") {
					var title = loc.SMAD + meas.id;
					var href = "#terminal:" + this.navigation.get("terminal") + ",patient:" + this.navigation.get("patient") + ",meas:" + meas.id;
					rows.push([meas.date, $.div(loc.added, $.e("a", {href: href}, title))]);
					if (meas.diagnosis) {
						rows.push([meas.date, $.div(loc.card_conclusion + meas.id + ":", $.div(meas.diagnosis), $.e("br"))]);
					}
				}
			}, this);
			var table = $.table.apply($, rows);
			table.cellSpacing = 5;
			$.inject($.clear("card_history"), table.format([{verticalAlign: "top", width: 100}]));
		},

		block_main: function(block) {
			// console.log(block)
			$.toggle((block || "").substr(0, 4) == "card", "card_data");
			$.toggle(block == "card_meas", "card_meas");
			$.toggle(block == "card_history", "card_history");
			$.toggle(block == "card_info", "card_info");
			$.toggle(block == "card_diagnosis", "card_diagnosis");
			$.toggle(block == "card_monitor", "card_monitor");
			$.toggle(block == "card_test", "card_test");
			$.toggle(block == "terminal", "terminal_info");
			// $.toggle(block == "main", "new_measurements");
		},

		monitor_read: function() {
			if (confirm(loc.read_confirm)) {
				this.monitor_mode = "read";
				var self = this;
				var iframe = $.e("iframe", {src: this.monitor_dispatcher_URL + "#read", style: {display: "none"}});
				$.$("monitor-container").appendChild(iframe);
				iframe.onload = function() {
					iframe.contentWindow.postMessage(window.location.href, self.monitor_dispatcher_URL);
				}
			}
		},

		monitor_prog: function() {
			if (confirm(loc.prog_confirm)) {
				this.monitor_mode = "prog";
				var self = this;
				var container = "monitor-prog";
				var iframe = $.e("iframe", {src: "about:blank", name: container, style: {display: "none"}});
				$.$("monitor-container").appendChild(iframe);
				var plan = this.make_plan();
				var input = $.e("input", {type: "hidden", name: "plan", value: plan});
				var form = $.e("form", {action: this.monitor_dispatcher_URL, method: "POST", target: container}, [input]);
				$.$("monitor-container").appendChild(form);
				form.submit();
				iframe.onload = function() {
					iframe.contentWindow.postMessage(window.location.href, self.monitor_dispatcher_URL);
				};
			}
		},

		submit_monitoring: function(data) {
			var response = window.UI.post({
				query: "import_result",
				result : data,
				terminal: window.UI.navigation.get("terminal"),
				patient: window.UI.navigation.get("patient"),
				type: "АД"
			});
			window.UI.event("add_meas_callback");
			alert(response.status == "ok" ? loc.read_complete : loc.read_error1);
		},

		monitor_listener: function(event) {
			if (this.monitor_mode == "read") {
				if (event.data == "error")
					alert(loc.read_error2);
				else
					this.submit_monitoring(event.data);
			} else {
				if (event.data == "error")
					alert(loc.prog_error);
				else
					alert(loc.prog_success);
			}
		}

	});

	var Loc = new $.Class({

		initialize: function(lang) {
			var n = lang == "ru" ? 0 : 1;
			for (var k in this.data) {
				this[k] = this.data[k][n];
			}
		},

		data: {
			ABP: ["Артериальное давление", "Arterial blood pressure"],
			sys_abp: ["САД", "Upper"],
			dia_abp: ["ДАД", "Lower"],
			pulse_abp: ["ПАД", "Diff"],
			rate: ["ЧСС", "Rate"],
			rate2: ["Частота пульса", "Heart rate"],
			time: ["Время", "Time"],
			error: ["Ошибка", "Err"],
			error2: ["Ошибка", "Error"],
			main: ["Главная", "Main"],
			admin: ["Администратор", "Administrator"],
			terminal: ["Терминал ", "Terminal "],
			add_card: ["Добавить карточку", "Add new card"],
			card_info: ["Пациент", "Patient"],
			card_history: ["Карточка", "Card"],
			diagnosis: ["Диагноз", "Diagnosis"],
			monitoring: ["Мониторирование", "Monitoring"],
			new_monitoring: ["Новое мониторирование", "New monitoring"],
			new_meas: ["Новое измерение", "New measurement"],
			analysis: ["Анализ", "Analysis"],
			conditions: ["Условия мониторирования", "Monitoring conditions"],
			comment: ["Комментарий", "Comment"],
			conclusion: ["Заключение", "Conclusion"],
			measurement: ["Измерение", "Measurement"],
			sys_abp2: ["Систолическое АД", "Systolic ABP"],
			dia_abp2: ["Диастолическое АД", "Diastolic ABP"],
			sys_abp3: ["Систолическое артериальное давление", "Systolic arterial blood pressure"],
			dia_abp3: ["Диастолическое артериальное давление", "Diastolic arterial blood pressure"],
			pulse_bp: ["Пульсовое АД", "Pulse ABP"],
			pulse_bp2: ["Пульсовое АД = САД - ДАД", null],
			kerdo: ["Индекс Кердо", "Kerdo index"],
			kerdo2: ["Вегетативный индекс Кердо (ВИ) = (1 - ДАД / ЧСС) * 100", null],
			criterion_s: ["Критерий S", "Criterion S"],
			criterion_s2: ["Критерий S = (САД * ДАД) / (САД - ДАД)", null],
			double_product: ["Двойное произведение", "Double product"],
			double_product2: ["Двойное произведение = (САД * ЧСС) / 100", null],
			minimum: ["Минимум", "Minimum"],
			maximum: ["Максимум", "Maximum"],
			average: ["Среднее", "Average"],
			stdev: ["Стандартное отклонение", "Standard deviation"],
			surname: ["Фамилия", "Surname"],
			name: ["Имя", "Name"],
			second_name: ["Отчество", "Second name"],
			dob: ["Дата рождения(дд.мм.гггг)", "Date of birth(dd.mm.yyyy)"],
			dob2: ["Дата рождения", "Date of birth"],
			sex: ["Пол", "Sex"],
			height: ["Рост", "Height"],
			weight: ["Вес", "Weight"],
			soc_category: ["Социальная категория", "Social category"],
			marital_status: ["Семейное положение", "Marital status"],
			education: ["Образование", "Education"],
			company: ["Место работы", "Company"],
			profession: ["Профессия", "Profession"],
			position: ["Должность", "Position"],
			city: ["Город", "City"],
			street: ["Улица", "Street"],
			phone1: ["Домашний телефон", "Home phone"],
			phone2: ["Служебный телефон", "Work phone"],
			male: ["мужской", "male"],
			female: ["женский", "female"],
			married: ["женат / замужем", "married"],
			single: ["не женат / не замужем", "single"],
			hip: ["Окружность бедер", "Hip"],
			waist: ["Окружность талии", "Waist"],
			house: ["Дом", "House"],
			building: ["Корпус", "Building"],
			appart: ["Квартира", "Appart"],
			policy_series: ["Серия полиса", "Policy series"],
			policy_number: ["Номер полиса", "Policy number"],
			dispensary_group: ["Группа диспансерного учета", "Dispensary group"],
			card_created: ["Карточка создана", "Card has been created"],
			card_changed: ["Карточка изменена", "Card has been modified"],
			card_create_error: ["Ошибка при создании карточки", "Card create error"],
			save: ["Сохранить", "Save"],
			add: ["Добавить", "Add"],
			read_confirm: ["Нажмите кнопку 'Событие'. Продолжить чтение данных?", "Press 'status' button. Continue downloading data?"],
			prog_confirm: ["Нажмите кнопку 'Событие'. Продолжить программирование?", "Press 'status' button. Continue programming?"],
			read_complete: ["Загрузка данных завершена", "Data download complete"],
			read_error1: ["Ошибка записи данных", "Data download error"],
			read_error2: ["Ошибка чтения данных", "Data read error"],
			prog_error: ["Ошибка при программировании монитора!", "Programming error"],
			prog_success: ["Программирование завершено", "Programming complete"],
			low_risk: ["низкий риск", "low risk"],
			average_risk: ["средний риск", "average risk"],
			high_risk: ["высокий риск", "high risk"],
			very_high_risk: ["очень высокий риск", "very high risk"],
			risk_lt15: ["менее 15%", "less than 15%"],
			risk_15_20: ["15-20%", "15-20%"],
			risk_20_30: ["20-30%", "20-30%"],
			risk_gt30: ["30% или выше", "greater than 30%"],
			added: ["Проведено ", "Added "],
			SMAD: ["суточное мониторирование СМАД #", "daily monitoring #"],
			card_conclusion: ["Заключение по суточному мониторированию СМАД #", "Daily monitoring conclusion #"],
			report: ["Отчет", "Report"],
			daily_index: ["Суточный индекс", "Daily index"],
			morning_speed: ["Скорость утреннего повышения", "Morning increase"],
			hypertension: ["гиперт.", "Hypertension"],
			hypotension: ["гипот.", "Hypotension"],
			pressure_load: ["Индекс времени", "Pressure load"],
			area_under_curve: ["Индекс площади", "Area under curve"],
			active_period: ["Активный период", "Active period"],
			passive_period: ["Пассивный период", "Passive period"],
			full_period: ["Весь период", "Full period"],
			number: ["№", "#"],
			card_number: ["№ карточки", "Card #"],
			patient: ["Пациент", "Patient"],
			gender: ["Пол", "Gender"],
			age: ["Возраст", "Age"],
			meas_date: ["Дата мониторирования", "Monitoring date"],
			weight_index: ["Индекс массы тела", "Weight index"],
			hip_waist_index: ["Индекс \"талия-бедро\"", "Hip-waist index"],
			send: ["Отправить на рассмотрение", "Send on review"],
			send_confirm: ["Отправить мониторирование на рассмотрение?", "Send measurement on review?"],
			mark_reviewed: ["Завершить анализ", "Finish review"],
			confirm_reviewed: ["Завершить анализ мониторирования?", "Finish monitoring review?"],
			new_measurements: ["Новые измерения:", "New measurements:"],
			reviewed_measurements: ["Рассмотренные измерения:", "Reviewed measurements:"],
			events: ["События", "Events"],
		}

	});

	exports.Interface = Interface;
	exports.Analysis = Analysis;
	exports.Menu = Menu;
	exports.Navigation = Navigation;
	exports.Cache = Cache;
	exports.Graph = Graph;
	exports.Loc = Loc;

})();

