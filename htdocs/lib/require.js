window.BASE = window.BASE || "";
window.PRELOAD = 0;
var scripts = {};
var notfound = {};
var required = [];

try { if(ENV == null) throw new Error() } catch(e) { window.ENV = "web" };

function cook(modules) {
	var M = {};
	for(var i = 0; i < modules.length; i++) {
		var mod = scripts[modules[i]];
		for(var k in mod) {
			if(M[k] == null) M[k] = mod[k];
		}
	}
	return M;
}

function ready(modules) {
	var ready = true;
	for(var i = 0; i < modules.length; i++) {
		if(scripts[modules[i]] == null) {
			ready = false;
			notfound[modules[i]] = 1;
		}
	}
	return ready;
}

function load(src) {
	window.exports = {};
	var xhr = window.ActiveXObject ? new ActiveXObject("Msxml2.XMLHTTP") : new XMLHttpRequest();
	xhr.open("GET", src, false);
	xhr.send("");
	if(xhr.status != 200)
		return null;
	try {
		eval(xhr.responseText);
		// console.log("loaded " + src + ": " + xhr.status);
	} catch(e) {
		if(window.console) console.log("Error loading " + src + "(" + e.lineNumber + "): " + e);
	}
	return exports;
}

window.require = function() {
	if(PRELOAD) {
		if(ready(arguments)) {
			return cook(arguments);
		} else {
			var M = {__modules: arguments};
			required.push(M);
			return M;
		}
	} else {
		for(var i = 0; i < arguments.length; i++) {
			var module = arguments[i];
			if(scripts[module] == null) {
				// load
				var src = module + ".js?t=" + new Date().getTime();
				var mod = scripts[module] = load("lib/" + src) || load(src);
				var methods = [];
				for(var k in mod) {
					methods.push(k);
				}

				// apply overrides
				var override = (window.OVERRIDES || {})[module] || {};
				for(var k in override) {
					if(typeof override[k] == "object" && override[k].constructor.toString() != Array.toString()) {
						for(var n in override[k])
							scripts[module][k][n] = override[k][n];
					} else {
						scripts[module][k] = override[k];
					}
				}

				if(window.console) console.log("Loaded " + module + ": " + methods.join(", "));
			}
		}
		return cook(arguments);
	}
}

window.requires = function(libs, includes, onLoadCallback) {
	if(!PRELOAD) {
		window.onload = onLoadCallback;
		return;
	}

	libs = typeof libs == "string" ? libs.split(/\ +/) : libs || [];
	includes = typeof includes == "string" ? includes.split(/\ +/) : includes || [];
	var loaded = false;
	var name;
	var is_lib = true;
	window.onload = function() {
		if(!loaded && window.console) console.warn("Failed to load script: " + name);
	}
	var next = function() {
		is_lib = libs.length > 0;
		name = libs.length ? libs.shift() : includes.shift();
		if(!name) {
			for(var k in notfound)
				if(window.console) console.warn("require: " + k + " not loaded");
			loaded = true;
			try {
				onLoadCallback();
			} catch(e) {
				if(window.console) console.warn("Error: " + e.message);
				throw e;
			}
			return;
		}
		
		// console.log("Loading " + name + " ..." + (scripts[name] != null));

		window.exports = {};
		scripts[name] = scripts[name] || {};

		var callback = function() {
			var methods = [];
			for(var k in window.exports) {
				methods.push(k);
				scripts[name][k] = window.exports[k];
			}
			var override = (window.OVERRIDES || {})[name] || {};
			for(var k in override) {
				if(typeof override[k] == "object" && override[k].constructor.toString() != Array.toString()) {
					for(var n in override[k])
						scripts[name][k][n] = override[k][n];
				} else {
					scripts[name][k] = override[k];
				}
			}
			delete notfound[name];
			for(var k in required) {
				var R = required[k];
				// console.warn(name + ": " + ready);
				if(ready(R.__modules)) {
					var M = cook(R.__modules);
					// var x = "";
					// for(var i = 0; i < R.__modules.length; i++) x += "," + R.__modules[i];
					// console.log("modules ready: " + x + " - " + M);
					for(var n in M) R[n] = M[n];
					delete required[k];
				}
			}
			if(window.console) console.log("loaded " + name + ": " + methods.join(", "));
		
			next();
		};

		var s = document.createElement("script");
		s.src = BASE + (is_lib ? "lib/" : "") + name + ".js?t=" + new Date().getTime();

		/*
		var m = document.createElement("script");
		var onload = "callback(...)";
		try {
			m.innerHTML = onload;
		} catch(e) {
			m.text = onload;
		}
		document.body.appendChild(m);
		*/

		var ua = navigator.userAgent.toLowerCase();
		if (/msie/.test(ua) && !/opera/.test(ua)) {
			s.onreadystatechange = function () {
				 /loaded|complete/.test(s.readyState) && callback();
			}
		} else {
			s.onload = callback;
		}

		document.body.appendChild(s);
	}
	next();
}

requires.API = "json amf base64 utils bigint config timer rtmp RSA.leemon RSA.orange MD5 SHA1 RSA web remote api";
