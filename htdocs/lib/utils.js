(function() {

	var $ = {};
	var timescale;
	var verbose = true, log_handler;

	$.Class = function(p) {
		var ext = p['extends'] || [];
		$.each(typeof(ext) == "object" ? ext : [ext], function(c) {
			$.extend(p, c);
		});

		var object = (p.initialize = p.initialize || function(){});
		$.apply(object, p['static'] || {});
		object.prototype = p;
		return object;
	}

	$.extend = function(base, ext) {
		base['super'] = (ext.prototype || {}).initialize;
		$.each(ext.prototype, function(v, k) {
			if(base[k] == null)
				base[k] = k == "initialize" ? function() { base['super'].apply(this, arguments) } : v;
		});
	}

	$.apply = function(o, props) {
		for(var k in props) o[k] = props[k];
		return o;
	}

	$.color = function(s, fgcolor, bgcolor, safe) {
		if(safe && (ENV == "app" || ENV == "term"))
			return s;
		return $.sprintf(
			"\033[%s%sm%s\033[0m",
			{bold: '1', red: '31', green: '32', blue: '34', gray: '30'}[fgcolor] || '0',
			{red: ';41', green: ';42', black: ';40'}[bgcolor] || '',
			s
		);
	}

	$.each = function(e, f, bind) {
		if(e) for(var k in e) f.call(bind, e[k], k);
	}

	$.every = function(a, f, bind) {
		if(a) for(var i = 0; i < a.length; i++) f.call(bind, a[i], i);
	}

	$['while'] = function(cond, f, bind) {
		var o;
		while(true) {
			o = cond.call(bind);
			if(!o) break;
			f.call(bind, o)
		}
	}

	$.values = function(o) {
		var a = [];
		for(var k in o)
			a.push(o[k]);
		return a;
	}

	$.keys = function(o) {
		var a = [];
		for(var k in o)
			a.push(k);
		return a;
	}

	$.map = function(f, arr) {
		var res = [];
		$.every(arr, function(o, i){res.push(f == null ? o : (typeof f == "function" ? f(o, i) : o[f]))});
		return res;
	}

	$.args = function(a, o) {
		if(o)
			for(var i = 2; i < arguments.length; i++)
				o[arguments[i]] = a[i - 2];
		return $.map(null, a);
	}

	$.hashmap = function(f, arr) {
		var res = {};
		$.every(arr, function(o, i){var _ = f ? f(o, i) : [o, o]; res[_[0]] = _[1]});
		return res;
	}

	$.merge = function(d, s) {
		s = s != null ? s : {};
		d = d != null ? d : $.is_array(s) ? [] : {};
		if($.is_array(s) && $.is_array(d)) {
			// array with unique values
			d = $.values( $.hashmap(function($_){ return [$.sprintf("%o", $_), $_] }, s.concat(d)) );
		} else if(typeof s == "object") {
			for(var k in s) d[k] = $.merge(d[k], s[k]);
		} else {
			d = s;
		}
		return d;
	}

	$.is_array = function(o) {
		try {
			return o && typeof o == "object" && o.constructor.toString() == Array.toString();
		} catch(e) {
			return o.length != null;
		}
	}

	$.filter = function(a, o) {
		var r = {};
		$.every(a, function(key) {r[key] = o[key]});
		return r;
	}

	// a = $.grep(function(a,b) { return a + 2 > b }, a)
	// a = $.grep(/123\w+/, a)
	// a = $.grep({key: {$gt: 5}}, a)
	// a = $.grep({key: {x: {$gt: 5}}}, a)
	// a = $.grep(null, a)
	$.grep = function(x, arr) {
		var res = [];
		$.every(arr, function(o, i){
			var z = false;
			if(x == null) {
				z = o != null;
			} else if(typeof(x) == "object") {
				if(x.exec) { // regexp
					z = x.exec(o) != null;
				} else { // extended condition
					z = true;
					var conditions = {
						$gt: 		function(a, b) { return a > b },
						$gte: 		function(a, b) { return a >= b },
						$lt: 		function(a, b) { return a < b },
						$lte: 		function(a, b) { return a <= b },
						$eq: 		function(a, b) { return a == b },
						$ne: 		function(a, b) { return a != b },
						$match:		function(a, b) { return a.match(b) },
						$defined:	function(a, b) { return b ? a != null : a == null }
					};
					var filtrate = function(object, key, filter) {
						if(object == null || filter == null) return z = z && filter == null;
						// $.log("%o - %s - %o", object, key, filter);
						if(key != null)
							object = object[key];
						for(var k in filter) {
							if(conditions[k] != null)
								z = z && conditions[k](object, filter[k]);
							else
								filtrate(object, k, filter[k]);
						}	
					}
					// for(var k in x) filtrate(o, k, x[k]);
					filtrate(o, null, x);
				}
			} else {
				z = x(o, i);
			}
			if(z) res.push(o)
		});
		return res;
	}

	$.match = function(filter, object) {
		// TODO: implement standalone match
		return $.grep(filter, [object]).length > 0;
	}

	$.F = function(o, f, a) {
		return function(){return f ? f.apply(o, a || arguments) : null};
	}

	$.dump = function(o, links, key, fast) {
		key = key || "";
		links = links || {};
		if(o == null) return "null";
		if(typeof o == "number" || typeof o == "boolean") return String(o);
		if(typeof o == "string") return $.sprintf('"%s"', o.replace("'", "\\'"));
		if(typeof o == "function") return "[Function]";
		// preventing recursion
		if(!fast) {
			var k = $.grep(function($_) { return o == links[$_]}, $.keys(links))[0];
			if(k != null) return "$" + k;
		}
		links[key] = o;
		// $.log(key);
		if($.is_array(o)) return "[" + $.map(function($_, i) { return $.dump($_, links, key + "." + i, fast)}, o).join() + "]";
		return "{" + $.grep(null, $.map(function($_) { return o.hasOwnProperty($_) ? '"' + $_ + '":' + $.dump(o[$_], links, key + "." + $_, fast) : null}, $.keys(o))).join() + "}";
	}

	$.sprintf = function() {
		var s = arguments[0];
		if(typeof(s) != "string" || arguments.length == 1)
			return String(s);
		var index = -1;
		for(var i = 1; i < arguments.length; i++){
			var m, r, o = arguments[i];
			index = s.indexOf("%", index);
			if(index == -1)
				return s;
			if(!(m = s.substr(index).match(/^\%([\d\.]*)(\w)/))) {
				i--;
				index++;
				continue;
			}

			var match = m[0], digit = m[1], letter = m[2];
			// print("matching " + s + ": [" + match + "|" + digit + "|" + letter + "] index=" + i + "\n");
			switch(letter) {
				case 'a': r = o ? o.join() : ""; break;
				case 's': r = o == null ? "" : String(o); break;
				case 'x': r = o == null ? "" : (typeof o == "number" ? (o >>> 32).toString(16) : $.hex.encode(o)); break;
				case 'd': r = Number(o); break;
				case 'D': r = new (require("bigint")).BigInt(o).format("e"); break; // rm?
				case 'o': r = $.dump(o); break;
				case 'O': r = $.dump(o, null, null, true); break;
				case 'e': r = typeof o == "string" ? o : o.name + " in " + o.fileName + ":" + o.lineNumber + " -- " + o.message; break;
				case 'E': r = $.map(function(x){x = x.match(/(.*?)@.*?([^\/]+)$/); return x ? x[2] + ' ' + x[1] : ""}, (o.stack || "").split("\n")).join("\n\t"); break;
				case 't': r = $.time("H:M:S"); break;
				case 'b': r = o ? "true" : "false"; break;
				case 'j': r = o == null ? "null" : typeof o == "number" ? String(o) : typeof o == "string" ? $.sprintf('"%s"', o.replace("'", "\\'")) : (ENV == "term" ? require("json").json.encode(o) : JSON.stringify(o)); break;
				case 'f': var d = Number(digit.substr(1)); var a = String(o).split("."); a[1] = d ? ((a[1] || "") + "0000000").substr(0, d) : a[1]; r = a.join("."); break;
				default: i--; index++; continue;
			}
			if(r != null) {
				if((letter == 's' || letter == 'o' || letter == 'O') && digit && digit < r.length)
					r = r.substr(0, digit) + "...";
				s = s.replace(match, r);
				index += r.length;
			}
		}
		return s;
	}

	$.qw = function(s) {
		return s.split(" ");
	}

	$.now = function() {
		return Math.floor($.time() / 1000);
	}

	$.time = function(format, seconds) {
		if(format) {
			var h, m, s;
			if(seconds) {
				h = Math.floor(seconds / 3600) % 24, m = Math.floor(seconds / 60) % 60, s = seconds % 60;
			} else {
				var date = new Date();
				h = date.getHours(), m = date.getMinutes(), s = date.getSeconds();
			}
			format = format.replace("S", s < 10 ? "0" + s : s);
			format = format.replace("M", m < 10 ? "0" + m : m);
			format = format.replace("H", h < 10 ? "0" + h : h);
			return format;
		} else {
			return Number(new Date()) * (timescale || 1);
		}
	}

	// sequence of N chars C or random 0-9a-f chars unless C is defined
	$.x = function(c, n) {
		var s = "";
		for(var i = 0; i < n; i++) s += c || (Math.floor(Math.random() * 16)).toString(16);
		return s;
	}

	$.logger = function(instance, prefix, scope, name, threshold) {
		var order = {
			trace: 0,
			log: 1,
			info: 2,
			warn: 3,
			error: 4
		};
		var colors = {
			trace: ["gray"],
			info: ["bold"],
			warn: ["red"],
			error: ["white", "red"]
		};

		prefix = $.grep(null, [prefix, scope ? '<' + scope + '>' : null, name ? '[' + name + ']' : null]).join(" ");
		if(prefix) prefix += " ";
		var format = function() {
			return prefix + $.sprintf.apply(null, arguments).replace(/\0/, "\\0\n");
		};
		$.every($.keys(order), function(level) {
			instance[level] = function() {
				// print(arguments[0] + " ::: " + arguments[1] + " ::: " + arguments[2] + "\n");
				var thresholds = $.logger.threshold || {};
				threshold = threshold || thresholds[scope] || thresholds["default"] || "log";
				if(order[level] < order[threshold])
					return;
				var plain, extended;
				plain = extended = $.time("(H:M:S) ") + format.apply(null, arguments);
				var color = colors[level];
				if(color)
					extended = $.color(plain, color[0], color[1]);
				if(log_handler) {
					log_handler(extended + "\n");
				}
				if(verbose !== false) {
					if(ENV != "web")
						print(extended + "\n", plain + "\n");
					else if(window.console)
						console[level || "log"](plain);
				}
			};
		});
		return instance;
	}

	$.timescale = function(_) {
		timescale = _;
	}

	$.verbose = function(_) {
		verbose = _;
	}

	$.log_handler = function(_) {
		log_handler = _;
	}

	$.logger($);

	$.iterator = new $.Class({

		initialize: function() {
			$.args(arguments, this, "iterate", "action");
		},

		next: function(){
			var x = this.iterate();
			if(x != null) this.action($.F(this, this.next), x);
			return x != null; 
		}

	});

	$.async = {
		
		'while': function(next, action) {
			(new $.iterator(next, action)).next();
		},

		each: function(arr, action, end) {
			var i = 0;
			(new $.iterator(function(){ if(arr[i] != null) return arr[i++]; if(end) end() }, action)).next();
		},

		event: function(count, handler) {
			return {
				fire: function() {
					if(--count == 0) handler();	
				}
			};
		}

	};

	$.test = $.Class({

		initialize: function(write) {
			this.write = function(){ var m = $.sprintf.apply(null, arguments); write ? write(m) : $.log($.color(m, "bold")); return m };
			this.count = 0;
			this.passed = 0;
			this.expected = 0;
			this.time = $.time();
			this.write("--- Test started ---");
		},

		assert: function(passed, m, a, b) {
			this.count++;
			if(passed) this.passed++;
			this.write("%s: %s %s", m, passed ? "passed" : $.color("failed", "red"), passed ? "" : $.sprintf("(%s :: %s)", a, b));
			return passed;
		},

		assertEqual: function(a, b, m) {
			return this.assert(a == b, m, a, b);
		},

		assertNotEqual: function(a, b, m) {
			return this.assert(a != b, m, a, b);
		},

		done: function(total) {
			return this.write("--- Test done in %ds. Passed: %s/%s ---", ($.time() - this.time) / 1000, this.passed, total || this.expected || this.count);
		}

	});

	$.assert = function(x) {
		if(!x) {
			$.error("Assertion failed");
			$['throw']("assert");
		}
	}

	$.xhr = function() {
		if(ENV != "web") return new (require("xhr").XMLHttpRequest)();

		var ua = navigator.userAgent.toLowerCase(); 
		if(!window.ActiveXObject)
			return new XMLHttpRequest();
		if (ua.indexOf('msie 5') == -1)
			return new ActiveXObject("Msxml2.XMLHTTP");
		else
			return new ActiveXObject("Microsoft.XMLHTTP");
	}

	$['throw'] = function(error) {
		try{ throw new Error(error || "Debug") } catch(e) {$.log("%E", e)};
	}

	$.replace = function(s, a, b) {
		a = a.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").split("|");
		b = b.split("|");
		for(var i = 0; i < a.length; i++)
			s = s.replace(new RegExp(a[i], "gi"), b[i]);
		return s;
	}

	$.entities = new new $.Class({
		a: "&amp;|&quot;|&apos;|&lt;|&gt;|&#92;",
		b: "&|\"|'|<|>|\\",	
		encode: function() { return $.replace.call(this, arguments[0], $.entities.b, $.entities.a) },
		decode: function() { return $.replace.call(this, arguments[0], $.entities.a, $.entities.b) }
	});

	// encode "abc" to "616263"
	$.hex = new new $.Class({
		encode: function(s) {
			var result = '';
			for(var i = 0; i < s.length; i++) {
				var c = s.charCodeAt(i);
				result += (c < 16 ? "0" : "") + c.toString(16);
			}
			return result;
		},
		decode: function(hex) {
			var r = '';
			if(hex.indexOf("0x") == 0 || hex.indexOf("0X") == 0) hex = hex.substr(2);

			if(hex.length % 2) hex += '0'; // ?????

			for(var i = 0; i < hex.length; i += 2)
				r += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
			return r;
		}
	});

	// encode/decode binary string <-> number
	$.bin = new new $.Class({
		encode: function(num) {
			var result = '';
			while(num != 0) {
				result = String(num & 1) + result;
				num = num >>> 1;
			}
			return result;
		},
		decode: function(str) {
			var result = 0;
			for(var i = 0; i < str.length; i++) {
				result = result << 1;
				result += str.charAt(i) == '1' ? 1 : 0;
			}
			return result;
		}
	});

	// encode/decode float number to system representation (64 bit)
	$['float'] = new new $.Class({
		encode: function(n) {
			var sign = n >= 0 ? 0 : 1;
			n = Math.abs(n);
			var a = Math.floor(n); // before point
			var b = n - a; // after point
			var a2 = $.bin.encode(a);
			var b2 = [];
			while(b != 0) {
				b *= 2;
				b2.push(b >= 1 ? '1' : '0');
				b = b - Math.floor(b);
			}
			var mantissa;
			var exp = 1023 + a2.length - 1;
			if(a2) {
				mantissa = a2 + b2.join("");
			} else {
				var i = 0;
				while(b2[0] == '0') {
					b2.shift();
					exp--; 
				}
				mantissa = b2.join("");
			}
			mantissa = mantissa.substr(1);
			mantissa += $.x('0', 52 - mantissa.length);
			mantissa = mantissa.substr(0, 52);
			// $.log("a = %s, b = %s, exp = %d, sign = %d", a2, b2.join(""), exp, sign);
			var exp2 = $.bin.encode(exp);
			exp2 = $.x('0', 11 - exp2.length) + exp2;
			// $.log("encode: exp = %s (%d), mantissa = %s", exp2, exp - 1023, mantissa);
			var result = String(sign) + exp2 + mantissa;
			// $.log("encode: result = %s", result);
			var stream = new $.ByteStream();
			stream.write32($.bin.decode(result.substr(0, 32)));
			stream.write32($.bin.decode(result.substr(32)));
			stream.reverse();
			return stream.read(8);
		},
		decode: function(str, round) {
			var stream = new $.ByteStream(str);
			stream.reverse();
			var n1 = $.bin.encode(stream.read32());
			var n2 = $.bin.encode(stream.read32());
			var n = $.x('0', 32 - n1.length) + n1 + $.x('0', 32 - n2.length) + n2;
			// $.log("decode: input = %s", n);
			var e = n.substr(1, 11);
			var sign = Number(n.charAt(0));
			var exp = $.bin.decode(e) - 1023;
			var mantissa = '1' + n.substr(12);
			// $.log("decode: exp = %s (%d), mantissa = %s, sign = %d", e, exp, mantissa, sign);

			while(exp < 0) {
				mantissa = '0' + mantissa;
				exp++;
			}
			var a = mantissa.substr(0, exp + 1);
			// $.log("decode: a = %s", a);
			if(a.length > 32) $.error("a exceeds 32 bits");
			a = $.bin.decode(a);
			// $.log("decode: a = %d", a);
			mantissa = mantissa.substr(exp + 1).split('');
			while(mantissa[mantissa.length - 1] == '0')
				mantissa.pop();
			// $.log("decode: b = %s", mantissa.join(""));
			exp = mantissa.length;
			var b1 = $.bin.decode(mantissa.splice(0, mantissa.length - 32).join(""));
			var b2 = $.bin.decode(mantissa.join(""));
			b1 = b1 / Math.pow(2, exp - 32);
			// $.log("b1 = %d", b1);
			b2 = b2 / Math.pow(2, exp);
			// $.log("b2 = %d", b2);
			var result = (a + b1 + b2) * (sign == 1 ? -1 : 1);
			if(round)
				result = Math.round(result * 1e5) / 1e5;
			return result;
		}
	});

	$.utf8 = {
		encode: function(s) {
			if (!s)
				return "";
			var result = "";
			for (var i = 0; i < s.length; i++) {
				var code = s.charCodeAt(i);
				var c = code;
				var length;
				var bits = 0;
				while (c > 0) {
					c = c >> 1;
					bits++;
				}
				if (bits <= 7) {
					// length = 1;
					result += String.fromCharCode(code);
					continue;
				} else if (bits <= 6 + 5) {
					length = 2;
				} else if (bits <= 6 + 6 + 4) {
					length = 3;
				} else if (bits <= 6 + 6 + 6 + 3) {
					length = 4;
				} else {
					return null;
				}
				var sequence = "";
				for (var j = 0; j < length; j++) {
					var last = j == length - 1;
					var rsh = last ? 7 - length : 6;
					var mask1 = (1 << rsh) - 1;
					var mask2 = last
						? ((0xF << (8 - length)) & 0xFF)
						: (1 << 7);
					// $.log("mask1: %s, mask2: %s", $.bin.encode(mask1), $.bin.encode(mask2));
					var c = (mask1 & code) | mask2;
					code = code >> rsh;
					sequence = String.fromCharCode(c) + sequence;
				}
				result += sequence;
			}
			return result;
		},
		decode: function(s) {
			if (!s)
				return "";
			var result = "";
			// $.log($.map(function(_) { return $.bin.encode(_.charCodeAt(0)) }, s.split('')).join(":"));
			for(var i = 0; i < s.length; i++) {
				var code = s.charCodeAt(i);
				var length;
				if(code & 0x80) { // 1xxxxxxx
					if((code & 0x40) == null) { // 10xxxxxx - wrong 1st byte
						return null;
					} else if((code & 0x20) == 0) { // 110xxxxx 10xxxxxx (2 bytes)
						code = code & 0x1f;
						length = 2;
					} else if((code & 0x10) == 0) { // 1110xxxx 10xxxxxx 10xxxxxx (3 bytes)
						code = code & 0x0f;
						length = 3;
					} else if((code & 0x08) == 0) { // 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx (4 bytes)
						code = code & 0x07;
						length = 4;
					} else {
						return null;
					}
					for(var n = 1; n < length; n++) {
						var next = s.charCodeAt(++i);
						if(next == null || (next & 0x80) == 0 || (next & 0x40)) // must be 10xxxxxx
							return null;
						code = (code << 6) + (next & 0x3f);
					}
				}
				result += String.fromCharCode(code);
			}
			return result;
		}
	};

	$.profiler = new new $.Class({
		start: function(){ this.time = Number(new Date()) },
		tick: function(a){ $.log("%s time: %dms", a, Number(new Date()) - this.time); this.start() }
	});

	$.sort = {
		inc: function(a,b) {return a > b},
		dec: function(a,b) {return a < b},
		rand: function() {return Math.random() > 0.5}
	};

	$.OxFF = function(ss) {
		var s = "";
		for(var i = 0; i < ss.length; i++)
			s += String.fromCharCode(ss.charCodeAt(i) & 0xFF);
		return s;
	}

	$.ByteStream = new $.Class({

		initialize: function(str) {
			this.data = str || "";
			this.pointer = 0;
		},

		write: function(str) {
			if(str) this.data += str;
		},

		write8: function(num) {
			this.data += String.fromCharCode(num & 0xFF);
		},

		write16: function(num) {
			this.write8(num >>> 8);
			this.write8(num);
		},

		write24: function(num) {
			this.write8(num >>> 16);
			this.write16(num);
		},

		write32: function(num) {
			this.write16(num >>> 16);
			this.write16(num);
		},

		read: function(length) {
			length = length != null ? length : this.data.length - this.pointer;
			var s = this.data.substr(this.pointer, length);
			this.pointer += s.length;
			return s;
		},

		read8: function() {
			var num = this.data.charCodeAt(this.pointer);
			if(this.data.length > this.pointer)
				this.pointer++;
			return num;
		},

		read16: function() {
			return (this.read8() << 8) | this.read8();
		},

		read24: function() {
			return (this.read8() << 16) | this.read16();
		},

		read32: function() {
			return (this.read16() << 16) | this.read16();
		},

		// change byte order: big-endian <-> little-endian
		reverse: function() {
			this.data = this.data.split("").reverse().join("");
		},

		available: function() {
			return this.data.length - this.pointer;
		},

		toString: function() {
			return this.data;
		}

	});

	$.Eventable = new $.Class({

		onEvent: function(evt, fn) {
			this._event_listeners = this._event_listeners || {};
			(this._event_listeners[evt] = this._event_listeners[evt] || []).push(fn);
			return [evt, this._event_listeners[evt].length - 1];
		},

		cancelEvent: function(event) {
			delete this._event_listeners[event[0]][event[1]];
		},

		event: function(evt) {
			var args = $.map(null, arguments).slice(1);
			$.every((this._event_listeners || {})[evt], function(fn) { if(fn) fn.apply(this, args) }, this);
		}

	});

	if(ENV != "web" || window.exports) $.each($, function(v, k){ exports[k] = v });

})();
