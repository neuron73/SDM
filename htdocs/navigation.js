(function() {

	var $ = require("utils", "web", "json");

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

	exports.Navigation = Navigation;

})();
