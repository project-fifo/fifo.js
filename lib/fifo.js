var sys = require('util');
var Q = require('q');
var restify = require('restify');

/*
  delete require.cache[require.resolve('./fifo.js')]

  require('./fifo.js')

  require('./lib/fifo.js')
  fifo = new FiFo("https://10.20.1.101", "test", "test")
  user = new User(fifo)
  group = new Group(fifo)
  org = new Organization(fifo)


  user.list().then(console.log)
  group.list().then(console.log)
  org.list().then(console.log)

  user.metadata_del('40896888-9738-4b83-9615-42c0c33da79a', "metadata/key")

  user.metadata_set('40896888-9738-4b83-9615-42c0c33da79a', "key", 1)

  fifo.cloud_connection()
*/


FiFo = function FiFo(endpoint, user, password) {
    this.version = "0.1.0";
    this.endpoint = endpoint;
    this.client = restify.createJsonClient({
        rejectUnauthorized: false,
        url: endpoint
    });
    var deferred = Q.defer();
    this.token = deferred.promise;
    this.headers = { 'accept': 'application/json' };
    if (!password) {
        // if only user is passed we treat it as token
        deferred.resolve(user);
    } else {
        this.user = user;
        this.password = password;

        this.client.post({
            path: "/api/" + this.version + "/sessions",
            headers: this.headers
        }, {
            user: user,
            password: password
        }, function(err, req, res, obj) {
            if (err) {
                console.log("error:", err, req, res);
                deferred.reject(new Error(err));
            } else {
                deferred.resolve(res.headers['x-snarl-token']);
            }
        });
    }
};

FiFo.prototype = {
    get: function(p) {
        var _this = this;
        return this.token.then(function(token) {
            var deferred = Q.defer();
            var path = "/api/" + _this.version + p;
            console.log("GET",  path);

            _this.headers['x-snarl-token'] = token;
            _this.client.get({
                path: path,
                headers: _this.headers
            }, function(err, req, res, obj) {
                if (err) {
                    console.log("error:", err, req, res);
                    deferred.reject(new Error(err));
                } else {
                    deferred.resolve(obj);
                }
            });
            return deferred.promise;
        });
    },
    del: function(p) {
        var _this = this;
        return this.token.then(function(token) {
            var deferred = Q.defer();
            var path = "/api/" + _this.version + p;
            console.log("DELETE",  path);
            _this.headers['x-snarl-token'] = token;
            _this.client.del({
                path: path,
                headers: _this.headers
            }, function(err, req, res, obj) {
                if (err) {
                    console.log("error:", err, req, res);
                    deferred.reject(new Error(err));
                } else {
                    deferred.resolve(obj);
                }
            });
            return deferred.promise;
        });
    },
    put: function(p, obj) {
        var _this = this;
        return this.token.then(function(token) {
            var deferred = Q.defer();
            var path = "/api/" + _this.version + p;
            console.log("PUT", path, obj);
            _this.headers['x-snarl-token'] = token;
            _this.client.put({
                path: path,
                headers: _this.headers
            }, obj, function(err, req, res, obj) {
                if (err) {
                    console.log("error:", err, req, res);
                    deferred.reject(new Error(err));
                } else {
                    deferred.resolve(obj);
                }
            });
            return deferred.promise;
        });
    },
    post: function(p, obj) {
        var _this = this;
        return this.token.then(function(token) {
            var deferred = Q.defer();
            var path = "/api/" + _this.version + p;
            console.log("PUT", path, obj);
            _this.headers['x-snarl-token'] = token;
            _this.client.post({
                path: path,
                headers: _this.headers
            }, obj, function(err, req, res, obj) {
                if (err) {
                    console.log("error:", err, req, res);
                    deferred.reject(new Error(err));
                } else {
                    deferred.resolve(obj);
                }
            });
            return deferred.promise;
        });
    },
    logout: function() {
        return this.token.then(function(token) {
            return this.del('/session/' + token);
        });
    },
    cloud_connection: function(){
        return this.get('/cloud/connection');
    }
};

User = function User(fifo) {
    this.fifo = fifo;
};


User.prototype = {
    _get: function(path) {
        return this.fifo.get("/users" + path);
    },
    _del: function(path) {
        console.log("del", path);
        return this.fifo.del("/users" + path);
    },
    _put: function(path, obj) {
        return this.fifo.put("/users" + path, obj);
    },
    _post: function(path, obj) {
        return this.fifo.post("/users", obj);
    },
    list: function() {
        return this._get("");
    },
    get: function(id) {
        return this._get("/" + id);
    },
    del: function(id) {
        return this._del("/" + id);
    },
    create: function(user, password) {
        return this._post(path, {
            user: user,
            password: password
        });
    },
    passwd: function(id, password) {
        return this._put("/" + id, {password: password});
    },
    grant: function(id, permission) {
        return this._put("/" + id + "/permissions/" + permission.join("/"), {});
    },
    revoke: function(id, permission) {
        return this._delete("/" + id + "/permissions/" + permission.join("/"));
    },
    join_group: function(id, group) {
        return this._put("/" + id + "/groups/" + group, {});
    },
    leave_group: function(id, group) {
        return this._delete("/" + id + "/groups/" + group);
    },
    join_org: function(id, org) {
        return this._put("/" + id + "/orgs/" + org, {});
    },
    active_org: function(id, org) {
        return this._put("/" + id + "/orgs/" + org, {active:true});
    },
    leave_org: function(id, org) {
        return this._delete("/" + id + "/orgs/" + org);
    },
    add_key: function(id, keyid, key) {
        var o = {};
        o[keyid] = key;
        return this._put("/" + id + "/keys", o);
    },
    delete_key: function(id, keyid) {
        return this._delete("/" + id + "/keys/" + keyid);
    },
    metadata_set: function(id, key, value) {
        o = {};
        var path;
        if (typeof(key) == "string") {
            o[key] = value;
            path = "/" + id + "/metadata";
        } else {
            path = key;
            key = path.pop();
            o[key] = value;
            path = "/" + id + "/metadata/" + path.join("/");
        }

        return this._put(path, o);
    },
    metadata_del: function(id, path) {
        return this._del("/" + id + "/metadata/" + path);
    },
};

Group = function Group(fifo) {
    this.fifo = fifo;
};

Group.prototype = {
    _get: function(path) {
        return this.fifo.get("/groups" + path);
    },
    _del: function(path) {
        console.log("del", path);
        return this.fifo.del("/groups" + path);
    },
    _put: function(path, obj) {
        return this.fifo.put("/groups" + path, obj);
    },
    _post: function(path, obj) {
        return this.fifo.post("/groups", obj);
    },
    list: function() {
        return this._get("");
    },
    get: function(id) {
        return this._get("/" + id);
    },
    del: function(id) {
        return this._del("/" + id);
    },
    create: function(name) {
        return this._post(path, {
            name: user
        });
    },
    grant: function(id, permission) {
        return this._put("/" + id + "/permissions/" + permission.join("/"), {});
    },
    revoke: function(id, permission) {
        return this._delete("/" + id + "/permissions/" + permission.join("/"));
    },
    metadata_set: function(id, key, value) {
        o = {};
        var path;
        if (typeof(key) == "string") {
            o[key] = value;
            path = "/" + id + "/metadata";
        } else {
            path = key;
            key = path.pop();
            o[key] = value;
            path = "/" + id + "/metadata/" + path.join("/");
        }

        return this._put(path, o);
    },
    metadata_del: function(id, path) {
        return this._del("/" + id + "/metadata/" + path);
    },
};


Organization = function Organization(fifo) {
    this.fifo = fifo;
};

Organization.prototype = {
    _get: function(path) {
        return this.fifo.get("/orgs" + path);
    },
    _del: function(path) {
        console.log("del", path);
        return this.fifo.del("/orgs" + path);
    },
    _put: function(path, obj) {
        return this.fifo.put("/orgs" + path, obj);
    },
    _post: function(path, obj) {
        return this.fifo.post("/orgs", obj);
    },
    list: function() {
        return this._get("");
    },
    get: function(id) {
        return this._get("/" + id);
    },
    del: function(id) {
        return this._del("/" + id);
    },
    create: function(name) {
        return this._post(path, {
            name: user
        });
    },
    add_trigger: function(id, trigger) {
        return this._put("/" + id + "/triggers", trigger);
    },
    remove_trigger: function(id, trigger) {
        console.error("Not working propperly yet");
        // throw Error("Not supported");
        return this._delete("/" + id + "/triggers/" + trigger);
    },
    metadata_set: function(id, key, value) {
        o = {};
        var path;
        if (typeof(key) == "string") {
            o[key] = value;
            path = "/" + id + "/metadata";
        } else {
            path = key;
            key = path.pop();
            o[key] = value;
            path = "/" + id + "/metadata/" + path.join("/");
        }

        return this._put(path, o);
    },
    metadata_del: function(id, path) {
        return this._del("/" + id + "/metadata/" + path);
    },
};
