(function() {

	var $ = require("utils");

	var $$ = {};

	$$.userAgent = navigator.userAgent.toLowerCase();
	$$.browser = {
		version: ($$.userAgent.match( /.+(?:rv|it|ra|ie)[\/: ]([\d.]+)/ ) || [0,'0'])[1],
		safari: /webkit/.test( $$.userAgent ),
		opera: /opera/.test( $$.userAgent ),
		msie: /msie/.test( $$.userAgent ) && !/opera/.test( $$.userAgent ),
		mozilla: /mozilla/.test( $$.userAgent ) && !/(compatible|webkit)/.test( $$.userAgent )
	};

	$$.param = function(k) {
		var re = new RegExp("\\?.*" + k + "=([^&]+).*$", "ig");
		return re.exec(document.location) ? RegExp.$1 : null;	 		
	}

	$$.$ = function(a) {
		return typeof(a) == "string" ? document.getElementById(a) : a;
	}

	$$.$$ = function(expr, element){
		var filter = {};
		var result = [];
		var parts = expr.split(" ");
		
		if(parts.length > 1){
			var e = $$.$$(parts[0], element)[0];
			return e != null ? $$.$$(parts.splice(1).join(" "), e) : [];
		} 
		
		$.apply(filter, $$.match(expr, /^\#([\w\d\-\_]+)/, "id"));
		$.apply(filter, $$.match(expr, /^([\w\d\:]*)\.?([\w\d\-\_\.]*)/, "tagName", "className"));
		$.apply(filter, $$.match(expr, /\[([\w\d\-]+)=([\w\d\.\-\_\*\+\/]+)\]$/, "attrName", "attrValue"));
		$.apply(filter, $$.match(expr, /\[(\d+)]$/, "index"));
		// console.warn(filter);
		
		var elements = [];
		
		if(filter.id) {
			
			if(element == null)
				elements = [$.$(filter.id)];
			else {
				var ee = $$.browser.msie ? $.$(element).all : $.$(element).getElementsByTagName("*")
				for(var i = 0; i < ee.length; i++){
					if(ee[i].id == filter.id)
						elements.push(ee[i]);
				}
			}
			
		} else {
		
			var target = $$.$(element) || document;
			
			if(filter.tagName == null || filter.tagName == "")
				elements = $$.browser.msie ? target.all : target.getElementsByTagName("*");
			else
				elements = target.getElementsByTagName(filter.tagName);
			
			// console.log(elements);
			
			if(filter.className) {
				var filterClasses = filter.className.split(/\./);
				var filtered = [];
				for(var i = 0; i < elements.length; i++){
					var classes = $.hashmap(function($_){ return [$_, 1] }, (elements[i].className || "").split(/\s+/));
					for(var j = 0; j < filterClasses.length; j++){
						if(classes[filterClasses[j]] == null)
							break;
						else if(j == filterClasses.length - 1)
							filtered.push(elements[i]);
					}
					/*
					for(var j = 0; j < classes.length; j++){
							if(classes[j] == filter.className){
								filtered.push(elements[i]);
								break;
							}
						}
					}*/
				}
				elements = filtered;
			}
		
			if(filter.attrName != null && filter.attrValue != null){
				var filtered = [];
				for(var i = 0; i < elements.length; i++){
					var attr = elements[i].getAttribute(filter.attrName);
					if(filter.attrValue == "*" && attr != null)
						filtered.push(elements[i]);
					else if(attr == filter.attrValue)
						filtered.push(elements[i]);
				}
				elements = filtered;
			}
			
		}
		return elements;
	}

	$$.match = function() {
		var res, m;
		var s = arguments[0];
		var re = arguments[1];
		re.lastIndex = 0;
		if(re.global){
			res = [];
			while(m = re.exec(s))
				res.push(m);
		} else {
			res = {};
			if(m = re.exec(s))
				for(var i = 1; i < m.length; i++)
					res[arguments[i + 1]] = m[i];
		}
		return res;
	}

	$$.hide = function() {
		$.every(arguments, function(e){
			$$.style(e, "display", "none");
		});
		return 0;
	}

	$$.show = function() {
		$.every(arguments, function(e){
			$$.style(e, "display", "block");
		});
		return 1;
	}

	$$.inline = function() {
		$.every(arguments, function(e){
			$$.style(e, "display", "inline");
		});
	}

	$$.toggle = function(s, e, e2) {
		if(typeof(s) != "boolean"){
			return $$.$(s).style.display == "none" ? $$.show(s) : $$.hide(s);
		} else {
			(s ? $$.show : $$.hide)(e);
			if(e2)
				(s ? $$.hide : $$.show)(e2);
		}
	}

	$$.style = function(e, a, b) {
		$.assert(e);
		if(e.constructor == Array) {
			$.each(e, function(v){ $$.style(v, a, b) });
		} else {
			e = $$.$(e);
			if(typeof b != "undefined") { var c = {}; c[a] = b; a = c; }
			if(a){
				var s = e.style ? e.style : e.style = {};
				for(var k in a){
					s[k] = typeof a[k] == "number"/* && $.re.style_px.exec(k) */? a[k] + "px" : a[k];
					//Log(k + " " + s[k] + " " + typeof a[k]);
				}
			}
		}
		return e;
	}

	$$.append = $$.inject = function(e, content) {
		e = $$.$(e);
		if(typeof(content) == "string") {
			e.appendChild(document.createTextNode(content))
		} else if(content){
			content.parentNode && content.parentNode.removeChild(content);
			e.appendChild(content);
		}
		return e;
	}

	$$.put = function(child, parent) {
		$$.inject(parent, $$.$(child));
		return child;
	}

	$$.e = function(tag, attr, content) {
		var e = typeof(tag) == "string" ? document.createElement(tag) : tag;
		if(content){
			if(typeof(content) == "object")
				$.every(content, function(o){$$.inject(e, o)});
			else if(typeof(content) == "string")
				$$.inject(e, content);
		}
		if(attr && attr.style){
			$$.style(e, attr.style);
			delete attr.style;
		}
		$.each(attr, function(v, k){
			if(k.substr(0, 2) == "on")
				e[k] = v;
			else if(k == "class")
				e.className = v;
			else
				e.setAttribute(k, v);
		});
		return e;
	}

	$$.clear = function(e){
		e = $$.$(e);
		for(var i = e.childNodes.length - 1; i >= 0; i--)
			e.removeChild(e.childNodes[i]);
		return e;
	}

	// table([cell1_1, cell1_2], [cell2_1, cell2_2])
	$$.table = function() {
		var b = $$.e("tbody");
		for(var i = 0; i < arguments.length; i++){
		   var r = $$.e("tr");	   
		   for(var j = 0; j < arguments[i].length; j++){
			   r.appendChild( $$.inject($$.e("td"), arguments[i][j]) );
		   }
		   b.appendChild(r);
		}
		var table = $$.e("table", {cellSpacing: 0, cellPadding: 0}, [b]);
		table.format = function(style, attr) {
			if(attr == null && style == null)
				return this;
			$.every(this.getElementsByTagName("tr"), function(tr) {
				if(tr.parentNode.parentNode != this)
					return;
				$.every(tr.childNodes, function(e, i) {
					if(e.nodeName.toLowerCase() == "td") {
						$.apply(e, (attr  || {})[i]);
						$$.style(e, (style || {})[i]);
					}
				});
			}, this);
			return this;
		}
		return table;
	}

	$$.klass = function(k, e) {
		e = $$.$(e);
		if(k.charAt(0) == '+')
			e.className = e.className + " " + k.substr(1);
		else if(k.charAt(0) == '-')
			e.className = e.className.replace(k.substr(1), "");
		else
			e.className = k;
		return e;
	}

	$$.div = function() {
		return $$.e("div", null, arguments);
	}

	$$.span = function() {
		return $$.e("span", null, arguments);
	}

	$$.img = function(src) {
		return $$.e("img", {src: src, border: 0});
	};

	$$.offset = function(e) {
		var offset = {left: 0, top: 0};
		if(!e)
			return offset;
		
		offset.left = e.offsetLeft - document.body.scrollLeft;
		offset.top  = e.offsetTop - document.body.scrollTop;
		while(e = e.offsetParent) {
			offset.left += e.offsetLeft;
			offset.top  += e.offsetTop;   
		}
		return offset;
	}

	$$.window_size = function() {
		var size = {};
		if(typeof window.innerHeight == "number") {
			size.width = window.innerWidth;
			size.height = window.innerHeight;
		} else {
			size.width = document.body.clientWidth || (document.documentElement || {}).clientWidth;
			size.height = document.body.clientHeight || (document.documentElement || {}).clientHeight;
		}
		return size;
	}

	$$.page_size = function() {
		return {
			width: document.body.scrollWidth,
			height: document.body.scrollHeight
		};
	}

	$$.cookie = {
		get: function(key) {
			var re = new RegExp(key + "=([^;]+)", "ig");
			return re.exec(document.cookie) ? unescape(RegExp.$1) : null;
		},
		set: function(key, value, expire) {
			var d = new Date();
			d.setSeconds(d.getSeconds() + expire || 99999999);
			document.cookie = key + "=" + escape(value || "") + "; path=/; expires=" + (expire == 0 ? 0 : d.toGMTString()) + ";";
		}
	};

	$$.input = function(default_text, onSubmit) {
		var e = $$.e("input", {
			type: "text",
			onkeypress: function(e) { if(onSubmit && e.keyCode == 13) onSubmit() }
		});
		e._focus = function() {
			this.style.color = "black";
			this.value = "";
		};
		e._blur = function() {
			this.style.color = "gray";
			this.value = default_text ? default_text : "";
		};
		e.onfocus = function() {
			if(!default_text || this.value == default_text) {
				this._focus();
			}
		};
		e.onblur = function() {
			if(this.value == "") {
				this._blur();
			}
		};
		e._blur();
		return e;
	};

	$$.play_sound = function(src) {
		var e = $$.$("audio_" + src);
		if(e)
			e.play();
		else
			document.body.appendChild($$.e("audio", {id: "audio_" + src, src: src, autoplay: true}));
	}

	for(var k in $$) exports[k] = $$[k];

})();
