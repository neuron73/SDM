(function () {

	var $ = require("utils", "web", "json");
	var SDM = require("analysis", "graph", "cache", "navigation", "menu", "conf");

	var AUTH;

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
					night_start: SDM.NIGHT_TIME_START,
					night_end: SDM.NIGHT_TIME_END,
					special: SDM.SPECIAL_TIME_START
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

				$.$("card_monitor_active_start").innerHTML = SDM.NIGHT_TIME_END + ":00";
				$.$("card_monitor_active_end").innerHTML = SDM.NIGHT_TIME_START + ":00";
				$.$("card_monitor_passive_start").innerHTML = SDM.NIGHT_TIME_START + ":00";
				$.$("card_monitor_passive_end").innerHTML = SDM.NIGHT_TIME_END + ":00";
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
			this.analysis = new SDM.Analysis($.$("abp_canvas"));
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
			this.cache = new SDM.Cache();
			this.navigation = new SDM.Navigation($.$("navigation"), {
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
			var menu = this.menus.terminals = this.menus.terminals || new SDM.Menu("terminals", $.F(this, function(title, terminal) {
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
					var menu = this.menus.patients = this.menus.patients || new SDM.Menu("patients", $.F(this, function(title, patient) {
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

					var menu2 = this.menus.new_meas = this.menus.new_meas || new SDM.Menu("new_measurements", $.F(this, function(title, meas) {
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
					$.show("tab_patients");
				} else {
					$.hide("tab_patients");
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
				// this.block_main(null);
				if (path && path.terminal && path.patient) {
					this.list_view(false);
					// $.hide("terminals", "patients");
					// $.hide("tab_terminals", "tab_patients");
					$.$("patient_name").innerHTML = item.title;
					var card_menu = this.menus.card = this.menus.card || new SDM.Menu("card_menu", $.F(this, function(title, id) {
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
					var submenu = new SDM.Menu(meas_submenu["АД"] = $.e("div", {'class': "meas_submenu"}), $.F(this, function(title, id) {
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
							// this.navigation.open(null, null, current_meas, {type: "panel", id: id, title: title});
							var nav = this.navigation;
							nav.go("#terminal:%s,patient:%s,meas:%s,panel:%s", nav.get("terminal"), nav.get("patient"), this.last_open_meas, id);
						}
					}));

					meas_submenu["ЭКГ"] = $.div();
					meas_submenu["ИАД"] = $.div();

					var types = ["АД", "ИАД", "ЭКГ"];
					var containers = ["monitoring", "abpm", "ecg"];
					var items = {};
					this.menus.measurements = this.menus.measurements || {};
					$.every(types, function(type, index) {
						this.menus.measurements[type] = this.menus.measurements[type] || new SDM.Menu(containers[index] + "_list", $.F(this, function(title, meas) {
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
					date[1] = SDM.MONTHS[month];
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

		save_meas: function(terminal, patient, n_meas, meas) {
			this.post({
				query: "save_meas",
				terminal: terminal,
				patient: patient,
				meas: n_meas,
				dinner_time: this.time2s(meas.dinner_time),
				sleep_time: this.time2s(meas.sleep_time),
				meas_before: this.abp2s(meas.meas_before),
				meas_after: this.abp2s(meas.meas_after),
				conditions: meas.conditions
			});
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

			var report_graph = new SDM.Graph($.$("report_canvas"));
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
				if (item) {
					// this.open_tab(null);
					this.block_main("card_meas");

					// выделение пункта меню
					var menu = this.menus.measurements["АД"]; // TODO: ЭКГ??
					var selected = -1;
					$.every(menu.items, function(_item, i) {
						if (_item[1].id == item.id)
							selected = i;
					});
					if (selected != -1) {
						menu.items[selected][2](menu.elements[selected]);
					}

					this.last_open_meas = item.id;
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

						this.monitoring_load(meas);
						this.monitoring_edit(false);

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
			var t = [];
			for (var i = 0; i < 3; i++) {
				if (time[i]) {
					t.push(time[i].split(":")[0] || "");
					t.push(time[i].split(":")[1] || "");
				}
			}
			return t.join(";");
		},

		s2abp: function(s) {
			var abp = [];
			if (s) {
				var a = s.split(";");
				for (var i = 0; i < a.length; i += 4) {
					abp.push(a[i] != "0" && a[i + 1] != "0" ? a[i] + "/" + a[i + 1] : "");
				}
			}
			return abp;
		},

		abp2s: function(abp) {
			var m = [];
			for (var i = 0; i < 3; i++) {
				if (abp[i]) {
					m.push(abp[i].split("/")[0]);
					m.push(abp[i].split("/")[1]);
					m.push("0");
					m.push("0");
				}
			}
			return m.join(";");
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
						this.value = m[2] + "." + SDM.MONTHS[m[1]] + "." + m[3];
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
				// this.block_main(item == null ? "card_meas" : "card_" + item.id);
				if (item != null) this.block_main("card_" + item.id);
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
		},

		monitoring_edit: function(edit) {
			var fields = $.qw("abp_monitoring_type time_sleep time_wake_up time_breakfast time_lunch time_dinner meas_before_1 meas_before_2 meas_before_3 meas_after_1 meas_after_2 meas_after_3");
			$.every(fields, function(name) {
				$.$(name).style.display = edit ? "inline" : "none";
				$.$(name + "_s").style.display = !edit ? "inline" : "none";
			});

			$.$("monitoring_edit").style.display = !edit ? "inline" : "none";
			$.$("monitoring_save").style.display = edit ? "inline" : "none";
		},

		monitoring_save: function() {
			var meas = {
				sleep_time: [$.$("time_sleep").value, $.$("time_wake_up").value],
				dinner_time: [$.$("time_breakfast").value, $.$("time_lunch").value, $.$("time_dinner").value],
				meas_before: [$.$("meas_before_1").value, $.$("meas_before_2").value, $.$("meas_before_3").value],
				meas_after: [$.$("meas_after_1").value, $.$("meas_after_2").value, $.$("meas_after_3").value],
				conditions: $.$("abp_monitoring_type").value
			};
			this.monitoring_load(meas);
			this.save_meas(this.navigation.get("terminal"), this.navigation.get("patient"), this.navigation.get("meas"), meas);
			this.monitoring_edit(false);
		},

		monitoring_load: function(meas) {
			$.$("time_sleep").value = $.$("time_sleep_s").innerHTML = meas.sleep_time[0] || "";
			$.$("time_wake_up").value = $.$("time_wake_up_s").innerHTML = meas.sleep_time[1] || "";
			$.$("time_breakfast").value = $.$("time_breakfast_s").innerHTML = meas.dinner_time[0] || "";
			$.$("time_lunch").value = $.$("time_lunch_s").innerHTML = meas.dinner_time[1] || "";
			$.$("time_dinner").value = $.$("time_dinner_s").innerHTML = meas.dinner_time[2] || "";
			$.$("meas_before_1").value = $.$("meas_before_1_s").innerHTML = meas.meas_before[0] || "";
			$.$("meas_before_2").value = $.$("meas_before_2_s").innerHTML = meas.meas_before[1] || "";
			$.$("meas_before_3").value = $.$("meas_before_3_s").innerHTML = meas.meas_before[2] || "";
			$.$("meas_after_1").value = $.$("meas_after_1_s").innerHTML = meas.meas_after[0] || "";
			$.$("meas_after_2").value = $.$("meas_after_2_s").innerHTML = meas.meas_after[1] || "";
			$.$("meas_after_3").value = $.$("meas_after_3_s").innerHTML = meas.meas_after[2] || "";
			$.$("abp_monitoring_type").value = meas.conditions || 0;
			$.$("abp_monitoring_type_s").innerHTML = $.$("abp_monitoring_type").options[meas.conditions || 0].text;
		}

	});

	exports.Interface = Interface;

})();
