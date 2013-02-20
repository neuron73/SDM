(function() {

	var $ = require("utils", "web", "json");

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

	exports.Cache = Cache;

})();
