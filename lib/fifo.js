var sys = require('util');
var Q = require('q');
var restify = require('restify');

/*
  delete require.cache[require.resolve('./fifo.js')]

  require('./fifo.js')

  require('./lib/fifo.js')
  f = new FiFo("http://10.20.1.101", "test", "test")
  u = new User(f)

  u.metadata_del('40896888-9738-4b83-9615-42c0c33da79a', "metadata/key")

  u.metadata_set('40896888-9738-4b83-9615-42c0c33da79a', "key", 1)

  u1 = u.get('40896888-9738-4b83-9615-42c0c33da79a')
  u1.inspect().value
  f.cloud_connection()
*/


FiFo = function FiFo(endpoint, user, password) {
    this.version = "0.1.0"
    this.endpoint = endpoint;
    this.user = user;
    this.password = password;
    this.client = restify.createJsonClient({
        url: endpoint
    })
    this.headers = { 'accept': 'application/json' };
    this.token = false;

    var deferred = Q.defer();
    this.client.post({
        path: "/api/" + this.version + "/sessions",
        headers: this.headers
    }, {
        user: user,
        password: password
    }, function(err, req, res, obj) {
        if (err) {
            console.log("error:", err, req, res)
            deferred.reject(new Error(err));
        } else {
            deferred.resolve(res.headers['x-snarl-token']);
        }
    })
    this.token = deferred.promise
}

FiFo.prototype = {
    get: function(p) {
        var js_scoping_sucks = this;
        return this.token.then(function(token) {
            var deferred = Q.defer();
            var path = "/api/" + js_scoping_sucks.version + p;
            console.log("GET",  path)

            js_scoping_sucks.headers['x-snarl-token'] = token
            js_scoping_sucks.client.get({
                path: path,
                headers: js_scoping_sucks.headers
            }, function(err, req, res, obj) {
                if (err) {
                    console.log("error:", err, req, res)
                    deferred.reject(new Error(err));
                } else {
                    deferred.resolve(obj);
                }
            });
            return deferred.promise
        });
    },
    del: function(p) {
        var js_scoping_sucks = this;
        return this.token.then(function(token) {
            var deferred = Q.defer();
            var path = "/api/" + js_scoping_sucks.version + p;
            console.log("DELETE",  path)
            js_scoping_sucks.headers['x-snarl-token'] = token
            js_scoping_sucks.client.del({
                path: path,
                headers: js_scoping_sucks.headers
            }, function(err, req, res, obj) {
                if (err) {
                    console.log("error:", err, req, res)
                    deferred.reject(new Error(err));
                } else {
                    deferred.resolve(obj);
                }
            });
            return deferred.promise
        });
    },
    put: function(p, obj) {
        var js_scoping_sucks = this;
        return this.token.then(function(token) {
            var deferred = Q.defer();
            var path = "/api/" + js_scoping_sucks.version + p;
            console.log("PUT", path, obj)
            js_scoping_sucks.headers['x-snarl-token'] = token
            js_scoping_sucks.client.put({
                path: path,
                headers: js_scoping_sucks.headers
            }, obj, function(err, req, res, obj) {
                if (err) {
                    console.log("error:", err, req, res)
                    deferred.reject(new Error(err));
                } else {
                    deferred.resolve(obj);
                }
            });
            return deferred.promise
        });
    },
    post: function(p, obj) {
        var js_scoping_sucks = this;
        return this.token.then(function(token) {
            var deferred = Q.defer();
            var path = "/api/" + js_scoping_sucks.version + p;
            console.log("PUT", path, obj)
            js_scoping_sucks.headers['x-snarl-token'] = token
            js_scoping_sucks.client.post({
                path: path,
                headers: js_scoping_sucks.headers
            }, obj, function(err, req, res, obj) {
                if (err) {
                    console.log("error:", err, req, res)
                    deferred.reject(new Error(err));
                } else {
                    deferred.resolve(obj);
                }
            });
            return deferred.promise
        });
    },
    cloud_connection: function(){
        return this.get('/cloud/connection')
    },
}

User = function User(fifo) {
    this.fifo = fifo;
};

User.prototype = {
    _get: function(path) {
        return this.fifo.get("/users" + path)
    },
    _del: function(path) {
        console.log("del", path)
        return this.fifo.del("/users" + path)
    },
    _put: function(path, obj) {
        return this.fifo.put("/users" + path, obj)
    },
    _post: function(path, obj) {
        return this.fifo.post("/users", obj)
    },
    list: function() {
        return this._get("")
    },
    get: function(id) {
        return this._get("/" + id)
    },
    del: function(id) {
        return this._del("/" + id)
    },
    create: function(user, password) {
        return this._post(path, {
            user: user,
            password: password
        })
    },
    metadata_set: function(id, path, key, value) {
        o = {}
        if (! value) {
            o[path] = key;
            path = "/" + id + "/metadata";
        } else {
            o[key] = value;
            path = "/" + id + "/metadata/" + path;
        }

        return this._put(path, o)
    },
    metadata_del: function(id, path) {
        return this._del("/" + id + "/metadata/" + path)
    },
}
