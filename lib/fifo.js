var sys = require('util');
var Q = require('q');
var restify = require('restify');

/*
  delete require.cache[require.resolve('./fifo.js')]

  require('./fifo.js')

  require('./lib/fifo.js')
  f = new FiFo("http://10.20.1.101", "test", "test")
  u = new User(f)
  f.cloud_connection()
*/


FiFo = function FiFo(endpoint, user, password ) {
    this.version = "0.1.0"
    this.endpoint = endpoint;
    this.user = user;
    this.password = password;
    this.client = restify.createJsonClient({
        url: endpoint
    })
    this.headers = { 'Accept': 'application/json', 'User-Agent': 'fifo.js' };
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
    get: function(path) {
        var js_scoping_sucks = this;
        return this.token.then(function(token) {
            var deferred = Q.defer();

            js_scoping_sucks.headers['x-snarl-token'] = token
            js_scoping_sucks.client.get({
                path: "/api/" + js_scoping_sucks.version + path,
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
    list: function() {
        return this._get("")
    },
    get: function(id) {
        return this._get("/" + id)
    }
}

