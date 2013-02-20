(function() {

	var $ = require("utils", "web", "json");

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

	exports.MeasList = MeasList;

})();
