(function() {

	var $ = require("utils", "web", "json");

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


	exports.Menu = Menu;

})();
